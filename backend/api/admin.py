from django.contrib import admin

from .models import Order, OrderItem, Product, ProductCategory, Stock


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


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["id", "customer", "order_date", "total_price"]
    list_filter = ["order_date"]
    search_fields = ["customer_name"]
    ordering = ["-order_date"]
    date_hierarchy = "order_date"
    inlines = [OrderItemInline]
    readonly_fields = ["order_date"]
