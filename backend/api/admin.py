import csv
import tempfile
from datetime import date, timedelta
from decimal import Decimal

import boto3
from account.models import CustomUser
from django.conf import settings
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, Sum
from django.db.models.functions import Round
from django.forms import ModelForm
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from shipping.models import ShippingDetails

from .forms import ProductImageAdminForm, ProductImageInlineForm
from .models import (
    Cart,
    CartItem,
    CustomUser,
    Order,
    OrderItem,
    Product,
    ProductCategory,
    ProductImage,
    Wishlist,
    WishlistItem,
)


class OrderAdminForm(ModelForm):
    """Custom form for Order admin."""

    class Meta:
        model = Order
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        # Remove duplicate prevention - allow same orders to be created
        # Focus on preventing double saves instead
        return cleaned_data


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    form = ProductImageInlineForm
    extra = 1
    fields = ["image_preview", "image_file", "image_url", "sort_order", "alt_text"]
    readonly_fields = ["image_preview"]
    ordering = ["sort_order"]

    class Media:
        css = {"all": ("admin/css/product_image_inline.css",)}

    def image_preview(self, obj):
        if obj.image_url:
            # Mark the first image as primary visually with green border
            is_primary = obj.sort_order == 0 or (
                obj.product and obj.product.images.first() == obj
            )
            border_style = (
                "border: 3px solid #4CAF50;"
                if is_primary
                else "border: 1px solid #ddd;"
            )

            return format_html(
                '<img src="{}" style="max-width: 100px; max-height: 100px; object-fit: contain; {}; border-radius: 4px; padding: 2px;" />',
                obj.image_url,
                border_style,
            )
        return format_html(
            '<div style="width: 100px; height: 100px; border: 2px dashed #ccc; border-radius: 4px; '
            'display: flex; align-items: center; justify-content: center; color: #999; font-size: 11px; text-align: center;">'
            "No image<br>yet</div>"
        )

    image_preview.short_description = "Preview"


# @admin.register(ProductImage)
# class ProductImageAdmin(admin.ModelAdmin):
#     form = ProductImageAdminForm
#     list_display = ["product", "image_preview_thumb", "sort_order", "is_primary_display", "created_at"]
#     list_filter = ["product"]
#     search_fields = ["product__name", "alt_text"]
#     ordering = ["product", "sort_order"]
#     autocomplete_fields = ["product"]

#     fieldsets = (
#         ('Product', {
#             'fields': ('product',)
#         }),
#         ('Image', {
#             'fields': ('image_file', 'image_url', 'alt_text'),
#             'description': 'Upload an image file or provide a URL. If you upload a file, it will be automatically uploaded to R2 storage.'
#         }),
#         ('Display Settings', {
#             'fields': ('sort_order',),
#             'description': 'The first image (sort_order = 0) is automatically the primary image.'
#         }),
#     )

#     def image_preview_thumb(self, obj):
#         if obj.image_url:
#             is_primary = obj.is_primary
#             border_color = "#4CAF50" if is_primary else "#ddd"
#             return format_html(
#                 '<img src="{}" style="max-width: 50px; max-height: 50px; object-fit: contain; border: 2px solid {}; border-radius: 4px;" />',
#                 obj.image_url,
#                 border_color
#             )
#         return format_html(
#             '<span style="color: #999; font-size: 11px;">No image</span>'
#         )

#     image_preview_thumb.short_description = "Preview"

#     def is_primary_display(self, obj):
#         """Display if this is the primary image (first by sort_order)."""
#         return obj.is_primary

#     is_primary_display.boolean = True
#     is_primary_display.short_description = "Primary"


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "get_price", "get_categories"]
    list_filter = ["categories"]
    filter_horizontal = ["categories"]
    search_fields = ["name"]
    ordering = ["name"]
    inlines = [ProductImageInline]

    fields = ["name", "description", "base_price", "holiday_fee", "categories"]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.prefetch_related("categories", "images").distinct()

    def get_price(self, obj):
        """Display the calculated final price."""
        return f"£{obj.price}"

    get_price.short_description = "Final Price"

    def get_readable_categories(self, obj):
        return ", ".join(obj.get_categories)

    get_readable_categories.short_description = "Categories"

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        if db_field.name == "categories":
            # Only categories that are not parents (i.e., that are leaf nodes)
            kwargs["queryset"] = ProductCategory.objects.filter(
                subcategories__isnull=True
            ).order_by("parent__name", "name")
        return super().formfield_for_manytomany(db_field, request, **kwargs)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)

        # Now categories are saved, safe to modify them
        instance = form.instance
        to_add = set()
        for cat in instance.categories.all():
            parent = cat.parent
            while parent:
                to_add.add(parent)
                parent = parent.parent
        if to_add:
            instance.categories.add(*to_add)


class ParentCategoriesFilter(admin.SimpleListFilter):
    title = _("Parent Category")
    parameter_name = "parent_category"

    def lookups(self, request, model_admin):
        # Only show parents that have subcategories
        parents = ProductCategory.objects.filter(subcategories__isnull=False).distinct()
        return [(parent.id, parent.name) for parent in parents]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(parent__id=self.value())
        return queryset


class HolidayFeeFilter(admin.SimpleListFilter):
    title = _("Have holiday_fee")
    parameter_name = "have_holiday_fee"

    def lookups(self, request, model_admin):
        return [
            ("yes", _("Yes")),
            ("no", _("No")),
        ]

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.filter(holiday_fee__gt=0)
        elif self.value() == "no":
            return queryset.filter(holiday_fee=0)
        return queryset


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "description", "parent"]
    list_filter = [ParentCategoriesFilter]
    search_fields = ["name"]
    ordering = ["parent__name", "name"]


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    fields = ["product", "quantity", "added_date"]
    readonly_fields = ["added_date"]
    autocomplete_fields = ["product"]


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ["user", "total_items", "total_price", "created_at", "updated_at"]
    list_filter = ["created_at", "updated_at"]
    search_fields = ["user__name", "user__email"]
    readonly_fields = ["created_at", "updated_at", "total_items", "total_price"]
    inlines = [CartItemInline]

    def total_items(self, obj):
        return obj.total_items

    total_items.short_description = "Total Items"

    def total_price(self, obj):
        return f"£{obj.total_price:.2f}"

    total_price.short_description = "Total Price"


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ["cart", "product", "quantity", "get_total_price", "added_date"]
    list_filter = ["added_date"]
    search_fields = ["cart__user__name", "product__name"]
    readonly_fields = ["added_date", "get_total_price"]
    autocomplete_fields = ["cart", "product"]

    def get_total_price(self, obj):
        return f"£{obj.get_total_price():.2f}"

    get_total_price.short_description = "Total Price"


class WishlistItemInline(admin.TabularInline):
    model = WishlistItem
    extra = 0
    fields = ["product", "added_date"]
    readonly_fields = ["added_date"]
    autocomplete_fields = ["product"]


@admin.register(Wishlist)
class WishlistAdmin(admin.ModelAdmin):
    list_display = ["user", "total_items", "created_at", "updated_at"]
    list_filter = ["created_at", "updated_at"]
    search_fields = ["user__name", "user__email"]
    readonly_fields = ["created_at", "updated_at", "total_items"]
    inlines = [WishlistItemInline]

    def total_items(self, obj):
        return obj.total_items

    total_items.short_description = "Total Items"


@admin.register(WishlistItem)
class WishlistItemAdmin(admin.ModelAdmin):
    list_display = ["wishlist", "product", "added_date"]
    list_filter = ["added_date"]
    search_fields = ["wishlist__user__name", "product__name"]
    readonly_fields = ["added_date"]
    autocomplete_fields = ["wishlist", "product"]


class DateFilter(admin.SimpleListFilter):
    title = _("Delivery Date")
    parameter_name = "future_date"

    def lookups(self, request, model_admin):
        return [
            ("past 7 days", _("Past 7 days")),
            ("today", _("Today")),
            ("Next 7 days", _("Next 7 days")),
            ("Next 30 days", _("Next 30 days")),
        ]

    def queryset(self, request, queryset):
        today = date.today()
        if self.value() == "past 7 days":
            return queryset.filter(
                delivery_date__gte=today - timedelta(days=7), delivery_date__lte=today
            )
        elif self.value() == "today":
            return queryset.filter(delivery_date=today)
        elif self.value() == "Next 7 days":
            return queryset.filter(
                delivery_date__gte=today, delivery_date__lte=today + timedelta(days=7)
            )
        elif self.value() == "Next 30 days":
            return queryset.filter(
                delivery_date__gte=today, delivery_date__lte=today + timedelta(days=30)
            )
        return queryset


def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=getattr(settings, "AWS_S3_REGION_NAME", None),
    )


def upload_invoice_to_s3(file_path, s3_key):
    s3_client = get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME
    s3_client.upload_file(file_path, bucket, s3_key)
    return s3_key


@admin.action(description="Create & Upload Invoice")
def create_and_upload_invoice(modeladmin, request, queryset):
    from weasyprint import HTML

    for order in queryset:
        # Render your invoice template to HTML
        html_string = render_to_string(
            "invoice.html", {"order": order, "business": settings.BUSINESS_INFO}
        )
        # Generate PDF in a temp file
        with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp_pdf:
            HTML(string=html_string).write_pdf(tmp_pdf.name)
            s3_key = f"invoices/order_{order.id}.pdf"
            upload_invoice_to_s3(tmp_pdf.name, s3_key)
            # Save the S3 key to the order
            order.invoice_link = s3_key
            order.save()
    modeladmin.message_user(
        request, "Invoice created and uploaded!", level=messages.SUCCESS
    )


@admin.action(description="Mark selected orders as Pending")
def mark_orders_pending(modeladmin, request, queryset):
    updated = queryset.update(status="pending")
    modeladmin.message_user(
        request,
        f"{updated} order(s) marked as pending.",
        level=messages.SUCCESS,
    )


@admin.action(description="Mark selected orders as Paid")
def mark_orders_paid(modeladmin, request, queryset):
    updated = queryset.update(status="paid")
    modeladmin.message_user(
        request,
        f"{updated} order(s) marked as paid.",
        level=messages.SUCCESS,
    )


@admin.action(description="Mark selected orders as Cancelled")
def mark_orders_cancelled(modeladmin, request, queryset):
    updated = queryset.update(status="cancelled")
    modeladmin.message_user(
        request,
        f"{updated} order(s) marked as cancelled.",
        level=messages.SUCCESS,
    )


@admin.action(description="Get the total income")
def calculate_sum(modeladmin, request, queryset):
    total_sum = sum(order.total_price for order in queryset)
    modeladmin.message_user(
        request,
        f"The sum of selected orders is {total_sum}",
        level=messages.SUCCESS,
    )


@admin.action(description="Get the total items purchased")
def calculate_total_items(modeladmin, request, queryset):
    total_items = sum(order.total_items for order in queryset)
    modeladmin.message_user(
        request,
        f"The total number of items purchased is {total_items}",
        level=messages.SUCCESS,
    )


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    min_num = 1
    extra = 1
    readonly_fields = ["get_total_price"]
    autocomplete_fields = ["product"]

    def get_total_price(self, obj):
        if obj and obj.product and obj.quantity:
            return round(obj.product.price * obj.quantity, 2)
        return "0.00"

    get_total_price.short_description = "Total Price"


class ShippingDetailsInline(admin.StackedInline):
    model = ShippingDetails
    fk_name = "order"
    extra = 0
    can_delete = False
    readonly_fields = [
        "shipping_tracking_number",
        "shipping_tracking_url",
        "shipping_label_url",
        "sendcloud_parcel_id",
        "shipping_status",
        "shipping_error_message",
    ]
    fields = [
        "shipping_method_id",
        "shipping_carrier",
        "shipping_service_name",
        "shipping_cost",
        "shipping_tracking_number",
        "shipping_tracking_url",
        "shipping_label_url",
        "sendcloud_parcel_id",
        "shipping_status",
        "shipping_error_message",
    ]


def retry_shipment_creation(modeladmin, request, queryset):
    """
    Admin action to retry shipment creation for selected orders.
    """
    import logging

    from shipping.service import ShippingService

    logger = logging.getLogger(__name__)
    shipping_service = ShippingService()

    success_count = 0
    failed_count = 0
    skipped_count = 0

    for order in queryset:
        details = getattr(order, "shipping_details", None)
        # Skip orders that are not paid
        if order.status != "paid":
            skipped_count += 1
            continue

        # Skip orders without shipping method
        if not details or not details.shipping_method_id:
            skipped_count += 1
            continue

        try:
            result = shipping_service.create_shipment_for_order(order)
            if result.get("success"):
                success_count += 1
                logger.info(
                    f"Retry: Successfully created shipment for order {order.id}"
                )
            else:
                failed_count += 1
                logger.warning(
                    f"Retry: Failed to create shipment for order {order.id}: {result.get('error')}"
                )
        except Exception as e:
            failed_count += 1
            logger.error(
                f"Retry: Exception creating shipment for order {order.id}: {e}",
                exc_info=True,
            )

    # Show feedback message
    messages = []
    if success_count > 0:
        messages.append(f"{success_count} shipment(s) created successfully")
    if failed_count > 0:
        messages.append(f"{failed_count} shipment(s) failed")
    if skipped_count > 0:
        messages.append(
            f"{skipped_count} order(s) skipped (not paid or no shipping method)"
        )

    modeladmin.message_user(request, ". ".join(messages))


retry_shipment_creation.short_description = (
    "Retry shipment creation for selected orders"
)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    form = OrderAdminForm

    class Media:
        js = ("admin/js/order_filter_cleaner.js",)

    actions = [
        create_and_upload_invoice,
        mark_orders_paid,
        mark_orders_cancelled,
        mark_orders_pending,
        calculate_sum,
        calculate_total_items,
        retry_shipment_creation,
        "export_orders_pdf",
        "food_summary_csv",
        "food_summary_excel",
    ]

    list_display = [
        "id",
        "delivery_date",
        "customer_name",
        "customer_phone",
        "customer_address",
        "notes",
        "get_total_items",
        "get_total_price",
        "status",
        "get_shipping_status_display",
        "get_invoice",
    ]
    list_display_links = ["id", "delivery_date", "customer_name"]
    list_filter = [
        DateFilter,
        "status",
        "shipping_details__shipping_status",
        HolidayFeeFilter,
    ]
    list_editable = ["status"]
    search_fields = [
        "customer__profile__name",
        "customer__profile__phone",
        "customer__email",
    ]
    ordering = ["-id"]
    date_hierarchy = "delivery_date"
    inlines = [OrderItemInline, ShippingDetailsInline]
    autocomplete_fields = ["customer"]

    def get_fields(self, request, obj=None):
        fields = [
            "customer",
            "notes",
            "status",
            "delivery_date",
        ]
        if obj:
            fields += [
                "address",
                "customer_phone",
                "customer_address",
                "get_total_items",
                "get_holiday_fee_amount",
                "get_total_price",
                "get_invoice",
                "is_home_delivery",
            ]
            if not request.user.has_perm("account.change_customuser"):
                return fields[0].replace("customer", "customer_name")
        fields += [
            "delivery_fee_manual",
            "delivery_fee",
            "holiday_fee",
            "discount",
        ]
        return fields

    def get_readonly_fields(self, request, obj=None):
        readonly = [
            "customer_name",
            "customer_phone",
            "customer_address",
            "get_total_items",
            "get_holiday_fee_amount",
            "get_total_price",
            "get_invoice",
            # Shipping fields are read-only (managed by system)
            "get_shipping_tracking_link",
            "get_shipping_label_link",
        ]
        return readonly  # Admins can edit customer, status, notes

    def get_queryset(self, request):
        self.request = request  # Save request for later use
        return super().get_queryset(request)

    def _is_single_date_filtered(self, request):
        """
        Check if a specific single date is filtered (not a date range).
        Returns True if:
        - DateFilter is set to "today"
        - date_hierarchy has all three parameters (year, month, day)
        """
        # Check DateFilter parameter
        date_filter_value = request.GET.get("future_date")
        if date_filter_value == "today":
            return True

        # Check date_hierarchy parameters (delivery_date__year, delivery_date__month, delivery_date__day)
        # If all three are present, it's a specific date
        year = request.GET.get("delivery_date__year")
        month = request.GET.get("delivery_date__month")
        day = request.GET.get("delivery_date__day")

        if year and month and day:
            return True

        return False

    def get_list_display(self, request):
        """
        Dynamically show delivery_date_order_id instead of id when a specific date is filtered.
        Show id for wider date ranges.
        """
        list_display = list(super().get_list_display(request))

        is_single_date = self._is_single_date_filtered(request)

        # If single date is filtered, replace 'id' with 'delivery_date_order_id'
        if is_single_date:
            if "id" in list_display:
                id_index = list_display.index("id")
                list_display[id_index] = "delivery_date_order_id"
        else:
            # For wider ranges, ensure 'id' is shown (it's already in the default list_display)
            if "delivery_date_order_id" in list_display:
                delivery_id_index = list_display.index("delivery_date_order_id")
                list_display[delivery_id_index] = "id"

        return list_display

    def get_list_display_links(self, request, list_display):
        """
        Dynamically update list_display_links based on whether we're showing id or delivery_date_order_id.
        """
        links = list(super().get_list_display_links(request, list_display))

        is_single_date = self._is_single_date_filtered(request)

        # Replace 'id' with 'delivery_date_order_id' in links if single date is filtered
        if is_single_date:
            links = [
                "delivery_date_order_id" if link == "id" else link for link in links
            ]

        return links

    def customer_name(self, obj):
        request = getattr(self, "request", None)
        if request and request.user.has_perm("account.change_customuser"):
            if obj.customer:
                url = reverse("admin:account_customuser_change", args=[obj.customer.id])
                return format_html('<a href="{}">{}</a>', url, obj.customer.name)
        return obj.customer.name if obj.customer else "No Customer"

    def customer_phone(self, obj):
        return (
            obj.customer.profile.phone
            if obj.customer and obj.customer.profile
            else "No Phone"
        )

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        order = form.instance
        items = order.items.all()

        if not order.delivery_fee_manual:
            # Sausage category name
            post_suitable_category = "Sausages and Marinated products"
            for item in items:
                category_names = item.product.categories.values_list("name", flat=True)
                if post_suitable_category not in [
                    name.lower() for name in category_names
                ]:
                    order.is_home_delivery = True
                    order.delivery_fee = 10
                    break
            else:
                order.is_home_delivery = False
                if order.total_price > 220:
                    order.delivery_fee = 0
                else:
                    total_weight = sum(item.quantity for item in items)
                    if total_weight <= 2:
                        order.delivery_fee = 5
                    elif total_weight <= 10:
                        order.delivery_fee = 8
                    else:
                        order.delivery_fee = 15
                    # elif total_weight <= 20:
                    #     delivery_fee = 15
                    # else:
                    #     delivery_fee = 25  # For > 20kg
        order.save()

    def get_total_price(self, obj):
        return obj.total_price

    get_total_price.short_description = "Total Price"

    def get_total_items(self, obj):
        return obj.total_items

    get_total_items.short_description = "Total Items"

    def get_holiday_fee_amount(self, obj):
        """Display holiday fee in actual money value, only if holiday_fee > 0."""
        if obj.holiday_fee > 0:
            return f"{obj.holiday_fee_amount:.2f}"
        return "-"

    get_holiday_fee_amount.short_description = "Holiday Fee (£)"

    def get_shipping_status_display(self, obj):
        """Display shipping status with color coding."""
        details = getattr(obj, "shipping_details", None)
        if not details or not details.shipping_status:
            if obj.status == "paid" and details and details.shipping_method_id:
                return format_html('<span style="color: orange;">⏳ Pending</span>')
            return "-"

        status_colors = {
            "pending_shipment": "orange",
            "label_created": "green",
            "shipment_failed": "red",
            "in_transit": "blue",
            "out_for_delivery": "purple",
            "delivered": "darkgreen",
        }

        status_icons = {
            "pending_shipment": "⏳",
            "label_created": "✅",
            "shipment_failed": "❌",
            "in_transit": "🚚",
            "out_for_delivery": "📦",
            "delivered": "✓",
        }

        color = status_colors.get(details.shipping_status, "gray")
        icon = status_icons.get(details.shipping_status, "")
        label = details.get_shipping_status_display()

        return format_html('<span style="color: {};">{} {}</span>', color, icon, label)

    get_shipping_status_display.short_description = "Shipping Status"

    def get_shipping_tracking_link(self, obj):
        """Display tracking number as clickable link if available."""
        details = getattr(obj, "shipping_details", None)
        if details and details.shipping_tracking_number:
            if details.shipping_tracking_url:
                return format_html(
                    '<a href="{}" target="_blank">{}</a>',
                    details.shipping_tracking_url,
                    details.shipping_tracking_number,
                )
            return details.shipping_tracking_number
        return "-"

    get_shipping_tracking_link.short_description = "Tracking Number"

    def get_shipping_label_link(self, obj):
        """Display label download link if available."""
        details = getattr(obj, "shipping_details", None)
        if details and details.shipping_label_url:
            return format_html(
                '<a href="{}" target="_blank" class="button">📄 Download Label</a>',
                details.shipping_label_url,
            )
        return "-"

    get_shipping_label_link.short_description = "Shipping Label"

    def save_model(self, request, obj, form, change):
        """Save the order without calculating delivery fees here to avoid double save."""
        # Don't calculate delivery fees in save_model to prevent double save
        # This will be handled in save_related after inlines are processed
        super().save_model(request, obj, form, change)

    def save_formset(self, request, form, formset, change):
        """
        Ensure order items merge duplicates before saving to avoid double creates.

        This method handles the case where a user tries to add a product that already
        exists in the order. Instead of showing an error, it merges the quantities.
        """
        if formset.model is OrderItem:
            instances = formset.save(commit=False)
            merged_items = []

            with transaction.atomic():
                for instance in instances:
                    # Skip empty rows or invalid data
                    if not instance.product or not instance.quantity:
                        continue

                    # Ensure order is set
                    instance.order = form.instance

                    if instance.pk:
                        # Existing item - just save it (quantity may have been updated)
                        instance.save()
                        continue

                    # New item - check if product already exists in database
                    # Use select_for_update to prevent race conditions
                    existing_item = (
                        OrderItem.objects.select_for_update()
                        .filter(order=instance.order, product=instance.product)
                        .first()
                    )

                    if existing_item:
                        # Merge quantities
                        old_quantity = existing_item.quantity
                        existing_item.quantity += instance.quantity
                        existing_item.save()
                        merged_items.append(
                            f"{existing_item.product.name}: {old_quantity} + {instance.quantity} = {existing_item.quantity}"
                        )
                    else:
                        # No existing item, save the new one
                        try:
                            instance.save()
                        except IntegrityError:
                            # If save fails due to unique constraint (race condition),
                            # try to merge with the item that was just created
                            existing_item = OrderItem.objects.filter(
                                order=instance.order, product=instance.product
                            ).first()
                            if existing_item:
                                old_quantity = existing_item.quantity
                                existing_item.quantity += instance.quantity
                                existing_item.save()
                                merged_items.append(
                                    f"{existing_item.product.name}: {old_quantity} + {instance.quantity} = {existing_item.quantity}"
                                )
                            else:
                                # Re-raise if we can't find the existing item
                                # This shouldn't happen, but handle it gracefully
                                raise IntegrityError(
                                    f"Could not save order item for product {instance.product.id} "
                                    f"and could not find existing item to merge."
                                )

                # Handle deleted items
                for obj in formset.deleted_objects:
                    obj.delete()

            # Show success message if items were merged
            if merged_items:
                messages.success(
                    request,
                    f"Order items merged successfully: {', '.join(merged_items)}",
                )
        else:
            # For other formsets, use default behavior
            super().save_formset(request, form, formset, change)

    def save_related(self, request, form, formsets, change):
        """Calculate delivery fields after saving inlines and save only once."""
        super().save_related(request, form, formsets, change)
        order = form.instance

        # Only calculate delivery fees if not manually set
        if not order.delivery_fee_manual:
            # Build compute source from current items after inlines are saved
            compute_source = [
                {"product": i.product, "quantity": i.quantity}
                for i in order.items.all()
            ]

            # Calculate delivery fee and home status
            is_home_delivery, delivery_fee = (
                order.calculate_delivery_fee_and_home_status_from_items(compute_source)
            )

            # Only save if values have changed to prevent unnecessary saves
            if (
                order.is_home_delivery != is_home_delivery
                or order.delivery_fee != delivery_fee
            ):
                order.is_home_delivery = is_home_delivery
                order.delivery_fee = delivery_fee
                order.save(update_fields=["is_home_delivery", "delivery_fee"])

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "customer":
            kwargs["queryset"] = CustomUser.objects.filter(is_staff=False)
            if not request.user.has_perm("account.change_customuser"):
                kwargs["disabled"] = True
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def get_invoice(self, obj):
        if not obj.invoice_link:
            return "No invoice"

        # Generate presigned url
        s3 = get_s3_client()
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                "Key": obj.invoice_link,
            },
            ExpiresIn=300,
        )
        return format_html('<a href="{}" target="_blank">Invoice</a>', url)

    get_invoice.short_description = "Invoice"

    def export_orders_pdf(self, request, queryset):
        from weasyprint import HTML

        html_string = render_to_string("orders.html", {"orders": queryset})

        # Generate PDF from HTML
        with tempfile.NamedTemporaryFile(delete=True) as output:
            HTML(string=html_string).write_pdf(target=output.name)
            output.seek(0)

            response = HttpResponse(output.read(), content_type="application/pdf")
            delivery_date = date.today()
            response["Content-Disposition"] = (
                f'attachment; filename="{delivery_date.strftime("%d-%b-%Y")}_Orders.pdf"'
            )
            return response

    export_orders_pdf.short_description = "Export Selected Orders to PDF"

    def food_summary_csv(self, request, queryset):
        """
        Export a food summary of all products and their total quantities for selected orders as CSV.
        Frozen products are on the left, fresh products on the right.
        """
        order_items = OrderItem.objects.filter(order__in=queryset).select_related(
            "product"
        )
        frozen_summary = {}
        ready_summary = {}
        for item in order_items:
            product = item.product
            if not product:
                continue
            if product.categories.filter(name__iexact="Frozen Products").exists():
                frozen_summary[product.name] = frozen_summary.get(
                    product.name, 0
                ) + float(item.quantity)
            else:
                ready_summary[product.name] = ready_summary.get(
                    product.name, 0
                ) + float(item.quantity)

        # Sort and convert to lists of tuples
        frozen_list = sorted(frozen_summary.items())
        ready_list = sorted(ready_summary.items())

        # Pad the shorter list
        max_len = max(len(frozen_list), len(ready_list))
        frozen_list += [("", "")] * (max_len - len(frozen_list))
        ready_list += [("", "")] * (max_len - len(ready_list))

        delivery_dates = queryset.values_list("delivery_date", flat=True).distinct()
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="{", ".join(sorted({d.strftime("%d-%b-%Y") for d in delivery_dates}))}_Products.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(["Frozen Product", "Quantity", "", "Ready Product", "Quantity"])
        for (f_name, f_qty), (r_name, r_qty) in zip(frozen_list, ready_list):
            writer.writerow([f_name, f_qty, "", r_name, r_qty])
        return response

    food_summary_csv.short_description = "Export Food Summary as CSV"

    def food_summary_excel(self, request, queryset):
        """
        Export a food summary of all products and their total quantities for selected orders as Excel.
        Frozen products are on the left, fresh products on the right.
        """
        order_items = OrderItem.objects.filter(order__in=queryset).select_related(
            "product"
        )

        frozen_summary = {}
        ready_summary = {}

        for item in order_items:
            product = item.product
            if not product:
                continue
            if product.categories.filter(name__iexact="Frozen Products").exists():
                frozen_summary[product.name] = frozen_summary.get(
                    product.name, 0
                ) + float(item.quantity)
            else:
                ready_summary[product.name] = ready_summary.get(
                    product.name, 0
                ) + float(item.quantity)

        frozen_list = sorted(frozen_summary.items())
        ready_list = sorted(ready_summary.items())

        max_len = max(len(frozen_list), len(ready_list))
        frozen_list += [("", "")] * (max_len - len(frozen_list))
        ready_list += [("", "")] * (max_len - len(ready_list))

        delivery_dates = queryset.values_list("delivery_date", flat=True).distinct()
        filename = (
            ", ".join(sorted({d.strftime("%d-%b-%Y") for d in delivery_dates}))
            + "_Products.xlsx"
        )

        # Create Excel workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Food Summary"

        ws.append(["Frozen Product", "Quantity", "", "Ready Product", "Quantity"])

        for (f_name, f_qty), (r_name, r_qty) in zip(frozen_list, ready_list):
            ws.append([f_name, f_qty, "", r_name, r_qty])

        # Auto-size columns
        for col in ws.columns:
            max_length = max(len(str(cell.value or "")) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max_length + 3

        # Return HTTP response
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        wb.save(response)
        return response

    food_summary_excel.short_description = "Export Food Summary as Excel"
