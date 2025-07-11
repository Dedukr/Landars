import csv
import tempfile
from datetime import date, timedelta

import boto3
from django.conf import settings
from django.contrib import admin, messages
from django.db.models import Count, Sum
from django.db.models.functions import Round
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from weasyprint import HTML

from .models import CustomUser, Order, OrderItem, Product, ProductCategory, Stock


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "price", "get_categories"]
    list_filter = ["categories"]
    filter_horizontal = ["categories"]  # красиво отображает множественные категории
    search_fields = ["name"]
    ordering = ["name"]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.prefetch_related("categories").distinct()

    def get_categories(self, obj):
        return ", ".join(
            [c.name for c in obj.categories.all().order_by("parent__name", "name")]
        )

    get_categories.short_description = "Categories"

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


class ParentCategoryFilter(admin.SimpleListFilter):
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


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "description", "parent"]
    list_filter = [ParentCategoryFilter]
    search_fields = ["name"]
    ordering = ["parent__name", "name"]


class DateFilter(admin.SimpleListFilter):
    title = _("Delivery Date")
    parameter_name = "future_date"

    def lookups(self, request, model_admin):
        return [
            ("past 7 days", _("Past 7 days")),
            ("today", _("Today")),
            ("Next 7 days", _("Next 7 days")),
            ("Next 30 days", _("Next 30 days")),
            # Add more as you need!
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


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    min_num = 1
    extra = 0
    readonly_fields = ["get_total_price"]
    autocomplete_fields = ["product"]

    # def get_total_price(self, obj):
    #     return round(obj.product.price * obj.quantity, 2)

    # get_total_price.short_description = "Total Price"


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


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):

    class Media:
        js = ("admin/js/order_filter_cleaner.js",)

    actions = [
        create_and_upload_invoice,
        mark_orders_paid,
        mark_orders_cancelled,
        mark_orders_pending,
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
        "get_total_price",
        "status",
        "get_invoice",
    ]
    list_display_links = ["id", "delivery_date", "customer_name"]
    list_filter = [DateFilter, "status"]
    list_editable = ["status"]
    search_fields = [
        "customer__profile__name",
        "customer__profile__phone",
        "customer__email",
    ]
    ordering = ["-delivery_date"]
    date_hierarchy = "delivery_date"
    inlines = [OrderItemInline]
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
                "customer_phone",
                "customer_address",
                "get_total_price",
                "get_invoice",
                "is_home_delivery",
            ]
            if not request.user.has_perm("account.change_customuser"):
                return fields[0].replace("customer", "customer_name")
        fields += [
            "delivery_fee_manual",
            "delivery_fee",
        ]
        return fields

    def get_readonly_fields(self, request, obj=None):
        readonly = [
            "customer_name",
            "customer_phone",
            "customer_address",
            "get_total_price",
            "get_invoice",
        ]

        if obj:
            if request.user.has_perm("api.can_change_status_and_note"):
                return ["customer_name"] + readonly  # Only status & notes editable
        return readonly  # Admins can edit customer, status, notes

    def get_queryset(self, request):
        self.request = request  # Save request for later use
        return super().get_queryset(request)

    def customer_name(self, obj):
        request = getattr(self, "request", None)
        if request and request.user.has_perm("account.change_customuser"):
            if obj.customer:
                url = reverse("admin:account_customuser_change", args=[obj.customer.id])
                return format_html('<a href="{}">{}</a>', url, obj.customer.name)
            return "No Customer"
        return obj.customer.name if obj.customer else "No Customer"

    # customer_name.short_description = "Customer Name"

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
        html_string = render_to_string("orders.html", {"orders": queryset})

        # Generate PDF from HTML
        with tempfile.NamedTemporaryFile(delete=True) as output:
            HTML(string=html_string).write_pdf(target=output.name)

            output.seek(0)
            # Use the delivery date of the first order for the filename

            delivery_dates = queryset.values_list("delivery_date", flat=True).distinct()
            response = HttpResponse(output.read(), content_type="application/pdf")
            response["Content-Disposition"] = (
                f'attachment; filename="{", ".join(sorted({d.strftime("%d-%b-%Y") for d in delivery_dates}))}_Orders.pdf"'
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
