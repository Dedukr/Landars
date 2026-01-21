from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from .models import Invoice, InvoiceLineItem, InvoiceNumberSequence


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 0
    can_delete = False

    def get_vat_display(self, obj):
        """Display VAT rate as percentage using InvoiceLineItem's method."""
        return obj.get_vat_display() if obj else "-"

    get_vat_display.short_description = "VAT Rate"

    readonly_fields = [
        "description",
        "quantity",
        "unit_price",
        "line_total",
        "get_vat_display",
        "vat_amount",
    ]


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    def subtotal_ex_vat_display(self, obj: Invoice):
        return obj.subtotal_ex_vat

    subtotal_ex_vat_display.short_description = "Subtotal (ex VAT)"

    def order_link(self, obj: Invoice):
        if not obj.order_id:
            return "-"
        url = reverse("admin:api_order_change", args=[obj.order_id])
        return format_html('<a href="{}">Order #{}</a>', url, obj.order_id)

    order_link.short_description = "Order"
    order_link.admin_order_field = "order"

    def invoice_pdf_link(self, obj: Invoice):
        if not obj.invoice_link:
            return "No invoice"
        try:
            url = obj.get_presigned_invoice_url(expires_in=300)
        except Exception:
            return "Invoice (unavailable)"
        return format_html('<a href="{}" target="_blank">Invoice</a>', url)

    invoice_pdf_link.short_description = "Invoice"

    # Hide raw storage key from admin UI; show `invoice_pdf_link` instead.
    exclude = ["invoice_link"]

    list_display = [
        "invoice_number",
        "order_link",
        "invoice_pdf_link",
        "status",
        "subtotal_ex_vat_display",
        "total_amount",
        "amount_paid",
        "created_at",
    ]
    list_filter = ["status", "created_at"]
    search_fields = ["invoice_number", "order__id", "order__customer__email"]
    list_display_links = ["invoice_number"]
    readonly_fields = [
        "invoice_number",
        "order",
        "invoice_pdf_link",
        "created_at",
        "customer_snapshot",
        "billing_address_snapshot",
        "seller_snapshot",
        "delivery_date",
        "delivery_date_order_id",
        "due_date",
        "subtotal_ex_vat",
        "holiday_fee_percent",
        "holiday_fee_amount",
        "delivery_fee_amount",
        "discount_amount",
        "vat_amount",
        "total_amount",
        "paid_at",
        "voided_at",
    ]
    inlines = [InvoiceLineItemInline]


@admin.register(InvoiceNumberSequence)
class InvoiceNumberSequenceAdmin(admin.ModelAdmin):
    list_display = ["id", "last_number"]
    readonly_fields = ["id"]
