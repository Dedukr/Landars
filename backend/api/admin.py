import csv

from django.contrib import admin
from django.db.models import Sum
from django.http import HttpResponse
from django.urls import reverse
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import CustomUser, Order, OrderItem, Product, ProductCategory, Stock


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "price"]
    list_filter = ["category"]
    search_fields = ["name"]
    ordering = ["category", "name"]


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "description"]


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 1
    readonly_fields = ["get_total_price"]

    def get_total_price(self, obj):
        return round(obj.product.price * obj.quantity, 2)

    get_total_price.short_description = "Total Price"


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    # form = OrderAdminForm
    # add_form = OrderCreateForm
    list_display = [
        "delivery_date",
        "customer_name",
        "customer_phone",
        "customer_address",
        "get_total_price",
        "status",
    ]
    list_filter = ["delivery_date", "status"]
    list_editable = ["status"]
    search_fields = [
        "customer__profile__name",
        "customer__profile__phone",
        "customer__email",
    ]
    ordering = ["-delivery_date"]
    date_hierarchy = "delivery_date"
    inlines = [OrderItemInline]

    def get_fields(self, request, obj=None):
        if obj:
            if request.user.has_perm("account.change_customuser"):
                return [
                    "customer",  # link or plain text
                    "notes",
                    "status",
                    "delivery_date",
                    "customer_phone",
                    "customer_address",
                    "get_total_price",
                ]
            return [
                "customer_name",
                "notes",
                "status",
                "delivery_date",
                "customer_phone",
                "customer_address",
                "get_total_price",
            ]
        return super().get_fields(request, obj)

    def get_readonly_fields(self, request, obj=None):
        readonly_on_change = [
            "delivery_date",
            "customer_phone",
            "customer_address",
            "get_total_price",
        ]

        if obj:  # We're in change mode
            if request.user.has_perm("api.can_change_status_and_note"):
                return [
                    "customer_name"
                ] + readonly_on_change  # Only status & notes editable
            return readonly_on_change  # Admins can edit customer, status, notes
        else:
            return []

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

    def customer_address(self, obj):
        profile = obj.customer.profile if obj.customer else None
        if profile and profile.address:
            address = profile.address
            return f"{address.address_line}, {address.address_line2}, {address.city}, {address.postal_code}"
        return "No Address"

    def get_total_price(self, obj):
        return obj.total_price

    get_total_price.short_description = "Total Price"

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "customer":
            kwargs["queryset"] = CustomUser.objects.filter(is_staff=False)
            if not request.user.has_perm("account.change_customuser"):
                kwargs["disabled"] = True
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    actions = ["food_summary_csv"]

    def food_summary_csv(self, request, queryset):
        """
        Export a food summary of all products and their total quantities for selected orders as CSV.
        Only works if orders for one date are selected!
        """
        # Find the date(s) in the queryset (ideally, filter to a single date)
        delivery_dates = queryset.values_list("delivery_date", flat=True).distinct()
        # if delivery_dates.count() != 1:
        #     self.message_user(
        #         request,
        #         "Please select orders for a single delivery date.",
        #         level="error",
        #     )
        #     return

        target_date = delivery_dates[0]

        # Gather all OrderItems for those orders
        order_items = OrderItem.objects.filter(order__in=queryset)
        food_summary = (
            order_items.values("product__name")
            .annotate(total_qty=Sum("quantity"))
            .order_by("product__name")
        )

        # Create CSV response
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="{target_date}_summary.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(["Product", "Total Quantity"])
        for row in food_summary:
            writer.writerow([row["product__name"], row["total_qty"]])

        return response

    food_summary_csv.short_description = "Export food Summary (CSV)"
