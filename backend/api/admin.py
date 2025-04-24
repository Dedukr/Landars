from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .forms import OrderAdminForm
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


@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    list_display = ["product__category", "product", "quantity"]
    list_filter = ["product__category"]
    search_fields = ["product__name"]
    ordering = ["product__category", "product__name"]


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 1
    readonly_fields = ["get_total_price"]

    def get_total_price(self, obj):
        return obj.product.price * obj.quantity

    get_total_price.short_description = "Total Price"


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    form = OrderAdminForm
    list_display = [
        "order_date",
        "customer_name",
        "customer_phone",
        "customer_address",
        "get_total_price",
        "status",
    ]
    list_filter = ["order_date", "status"]
    list_editable = ["status"]
    search_fields = [
        "customer__profile__name",
        "customer__profile__phone",
        "customer__email",
    ]
    ordering = ["-order_date"]
    date_hierarchy = "order_date"
    inlines = [OrderItemInline]
    readonly_fields = [
        "order_date",
        "customer_name",
        "customer_phone",
        "customer_address",
        "get_total_price",
    ]

    # Custom methods to display customer info in the admin list
    def customer_name(self, obj):
        return obj.customer.name if obj.customer else "No Customer"

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
        return round(obj.total_price, 2)

    get_total_price.short_description = "Total Price"

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "customer":
            kwargs["queryset"] = CustomUser.objects.filter(is_staff=False)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    fieldsets = [
        (None, {"fields": ("customer", "notes")}),
        (_("Order Details"), {"fields": ("order_date", "status")}),
        (
            "Customer Info",
            {
                "fields": (
                    "customer_name",
                    "customer_phone",
                    "customer_address",
                )
            },
        ),
        ("Total Price", {"fields": ("get_total_price",)}),
    ]
