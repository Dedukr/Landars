from __future__ import annotations

from django.contrib import admin, messages
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404, render
from django.urls import path, reverse
from django.utils.html import format_html

from festival.forms import FestivalCancelOrderForm, FestivalProductAdminForm
from festival.models import (
    FestivalAddition,
    FestivalAdditionClass,
    FestivalCategory,
    FestivalCreditNote,
    FestivalInvoice,
    FestivalNumberSequence,
    FestivalOrder,
    FestivalOrderItem,
    FestivalPrinter,
    FestivalPrintJob,
    FestivalProduct,
)
from festival.services.cancellations import (
    FestivalCancellationError,
    cancel_festival_order,
)
from festival.services.cloudprnt import (
    CloudPRNTError,
    create_reprint_batch,
    create_retry_job,
)
from festival.services.documents import get_presigned_pdf_url


class FestivalOrderItemInline(admin.TabularInline):
    model = FestivalOrderItem
    extra = 0
    can_delete = False
    max_num = 0
    readonly_fields = [
        "product",
        "addition",
        "quantity",
        "product_name",
        "addition_name",
        "addition_unit_price",
        "unit_price",
        "vat_rate",
        "line_net",
        "line_vat",
        "line_total",
    ]


@admin.register(FestivalCategory)
class FestivalCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "product_count"]
    search_fields = ["name"]
    ordering = ["name"]

    @admin.display(description="Products")
    def product_count(self, obj: FestivalCategory) -> int:
        return obj.products.count()


@admin.register(FestivalAdditionClass)
class FestivalAdditionClassAdmin(admin.ModelAdmin):
    list_display = ["name", "addition_count", "product_count"]
    search_fields = ["name"]
    ordering = ["name"]

    @admin.display(description="Additions")
    def addition_count(self, obj: FestivalAdditionClass) -> int:
        return obj.additions.count()

    @admin.display(description="Products")
    def product_count(self, obj: FestivalAdditionClass) -> int:
        return obj.products.count()


@admin.register(FestivalAddition)
class FestivalAdditionAdmin(admin.ModelAdmin):
    list_display = ["name", "addition_class", "price"]
    list_filter = ["addition_class"]
    search_fields = ["name", "addition_class__name"]
    autocomplete_fields = ["addition_class"]
    ordering = ["addition_class__name", "name"]


@admin.register(FestivalProduct)
class FestivalProductAdmin(admin.ModelAdmin):
    form = FestivalProductAdminForm
    list_display = [
        "name",
        "category",
        "addition_class",
        "price",
        "vat_rate",
        "is_active",
        "created_at",
        "image_preview",
    ]
    list_filter = ["category", "addition_class", "is_active", "vat_rate"]
    search_fields = ["name", "category__name", "addition_class__name"]
    autocomplete_fields = ["category", "addition_class"]
    readonly_fields = ["created_at", "updated_at", "image_preview"]
    fields = [
        "category",
        "addition_class",
        "name",
        "price",
        "vat_rate",
        "is_active",
        "image_url",
        "image_upload",
        "image_preview",
        "created_at",
        "updated_at",
    ]

    def image_preview(self, obj: FestivalProduct):
        if not obj.image_url:
            return "-"
        return format_html(
            '<img src="{}" alt="" style="max-height:80px;max-width:120px;" />',
            obj.image_url,
        )

    image_preview.short_description = "Preview"


@admin.register(FestivalOrder)
class FestivalOrderAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "order_number",
        "total_price",
        "status",
        "created_at",
        "created_by",
        "invoice_pdf_link",
        "print_status_summary",
    ]
    list_display_links = ["id", "order_number"]
    list_filter = ["status", "created_at"]
    search_fields = ["id", "order_number", "client_request_id", "invoice__invoice_number"]
    inlines = [FestivalOrderItemInline]
    readonly_fields = [
        "order_number",
        "total_price",
        "created_at",
        "created_by",
        "status",
        "invoice_pdf_link",
        "cancelled_at",
        "cancellation_reason",
        "credit_note_pdf_link",
        "client_request_id",
        "request_fingerprint",
    ]
    fields = readonly_fields

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("invoice", "invoice__credit_note", "created_by")
            .prefetch_related("print_jobs")
        )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                "<path:object_id>/cancel/",
                self.admin_site.admin_view(self.cancel_view),
                name="festival_festivalorder_cancel",
            ),
        ]
        return custom + urls

    @staticmethod
    def _invoice(obj: FestivalOrder) -> FestivalInvoice | None:
        try:
            return obj.invoice
        except FestivalInvoice.DoesNotExist:
            return None

    @staticmethod
    def _credit_note(obj: FestivalOrder) -> FestivalCreditNote | None:
        invoice = FestivalOrderAdmin._invoice(obj)
        if invoice is None:
            return None
        try:
            return invoice.credit_note
        except FestivalCreditNote.DoesNotExist:
            return None

    def invoice_pdf_link(self, obj: FestivalOrder):
        invoice = self._invoice(obj)
        if invoice is None or not invoice.pdf_key:
            return "—"
        try:
            url = get_presigned_pdf_url(invoice.pdf_key)
        except Exception:
            return "—"
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">Open PDF</a>', url
        )

    invoice_pdf_link.short_description = "Invoice PDF"

    def credit_note_pdf_link(self, obj: FestivalOrder):
        if not obj.pk:
            return "—"
        if obj.status != FestivalOrder.Status.CANCELLED:
            url = reverse("admin:festival_festivalorder_cancel", args=[obj.pk])
            return format_html(
                '<a class="button" href="{}">Cancel order and issue credit note</a>',
                url,
            )
        credit_note = self._credit_note(obj)
        if credit_note is None or not credit_note.pdf_key:
            return "—"
        try:
            url = get_presigned_pdf_url(credit_note.pdf_key)
        except Exception:
            return "—"
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">Open PDF</a>', url
        )

    credit_note_pdf_link.short_description = "Credit note"

    def print_status_summary(self, obj: FestivalOrder):
        jobs = obj.print_jobs.all()
        if not jobs:
            return "—"
        return ", ".join(f"{j.job_type}:{j.status}" for j in jobs)

    print_status_summary.short_description = "Print jobs"

    def cancel_view(self, request, object_id):
        order = get_object_or_404(FestivalOrder, pk=object_id)
        if not (
            request.user.is_superuser
            or request.user.has_perm("festival.cancel_festival_order")
        ):
            messages.error(request, "You do not have permission to cancel festival orders.")
            return HttpResponseRedirect(
                reverse("admin:festival_festivalorder_change", args=[order.pk])
            )

        if request.method == "POST":
            form = FestivalCancelOrderForm(request.POST)
            if form.is_valid():
                try:
                    cancel_festival_order(
                        order=order,
                        user=request.user,
                        reason=form.cleaned_data.get("reason") or "",
                        request=request,
                    )
                except FestivalCancellationError as exc:
                    messages.error(request, str(exc))
                else:
                    messages.success(
                        request,
                        f"Order #{order.order_number} cancelled and credit note issued.",
                    )
                    return HttpResponseRedirect(
                        reverse("admin:festival_festivalorder_change", args=[order.pk])
                    )
        else:
            form = FestivalCancelOrderForm()

        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "original": order,
            "form": form,
            "title": f"Cancel festival order #{order.order_number}",
        }
        return render(request, "admin/festival/cancel_order.html", context)


@admin.register(FestivalInvoice)
class FestivalInvoiceAdmin(admin.ModelAdmin):
    list_display = [
        "invoice_number",
        "order_link",
        "status",
        "total_gross",
        "issued_at",
        "pdf_link",
        "credit_note_link",
    ]
    list_filter = ["status", "issued_at"]
    search_fields = ["invoice_number", "order__id"]
    readonly_fields = [
        "order",
        "invoice_number",
        "status",
        "issued_at",
        "subtotal_net",
        "vat_total",
        "total_gross",
        "seller_snapshot",
        "vat_breakdown",
        "pdf_key",
        "credited_at",
        "pdf_link",
        "retry_pdf_button",
    ]
    actions = ["retry_pdf_action"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def order_link(self, obj: FestivalInvoice):
        url = reverse("admin:festival_festivalorder_change", args=[obj.order_id])
        return format_html('<a href="{}">Order {}</a>', url, obj.order_id)

    order_link.short_description = "Order"

    def pdf_link(self, obj: FestivalInvoice):
        if not obj.pdf_key:
            return "Missing PDF"
        try:
            url = get_presigned_pdf_url(obj.pdf_key)
        except Exception:
            return "PDF unavailable"
        return format_html('<a href="{}" target="_blank">PDF</a>', url)

    pdf_link.short_description = "PDF"

    def credit_note_link(self, obj: FestivalInvoice):
        try:
            cn = obj.credit_note
        except FestivalCreditNote.DoesNotExist:
            return "-"
        url = reverse("admin:festival_festivalcreditnote_change", args=[cn.pk])
        return format_html('<a href="{}">{}</a>', url, cn.credit_note_number)

    credit_note_link.short_description = "Credit note"

    def retry_pdf_button(self, obj: FestivalInvoice):
        if obj.pdf_key:
            return "PDF present"
        return "Use action: Retry PDF generation"

    retry_pdf_button.short_description = "PDF retry"

    @admin.action(description="Retry PDF generation")
    def retry_pdf_action(self, request, queryset):
        from festival.tasks import generate_festival_invoice_pdf_task

        for invoice in queryset:
            generate_festival_invoice_pdf_task.delay(invoice.pk)
        messages.success(request, f"Queued PDF retry for {queryset.count()} invoice(s).")


@admin.register(FestivalCreditNote)
class FestivalCreditNoteAdmin(admin.ModelAdmin):
    list_display = [
        "credit_note_number",
        "original_invoice_number",
        "total_gross",
        "issued_at",
        "pdf_link",
    ]
    search_fields = ["credit_note_number", "original_invoice_number"]
    readonly_fields = [
        "invoice",
        "credit_note_number",
        "issued_at",
        "reason",
        "original_invoice_number",
        "subtotal_net",
        "vat_total",
        "total_gross",
        "seller_snapshot",
        "vat_breakdown",
        "pdf_key",
        "pdf_link",
    ]
    actions = ["retry_pdf_action"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def pdf_link(self, obj: FestivalCreditNote):
        if not obj.pdf_key:
            return "Missing PDF"
        try:
            url = get_presigned_pdf_url(obj.pdf_key)
        except Exception:
            return "PDF unavailable"
        return format_html('<a href="{}" target="_blank">PDF</a>', url)

    pdf_link.short_description = "PDF"

    @admin.action(description="Retry PDF generation")
    def retry_pdf_action(self, request, queryset):
        from festival.tasks import generate_festival_credit_note_pdf_task

        for cn in queryset:
            generate_festival_credit_note_pdf_task.delay(cn.pk)
        messages.success(request, f"Queued PDF retry for {queryset.count()} credit note(s).")


@admin.register(FestivalPrinter)
class FestivalPrinterAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "mac_address",
        "is_active",
        "last_seen_at",
        "last_status_code",
        "printing_in_progress",
        "current_job_token",
    ]
    list_filter = ["is_active"]
    search_fields = ["name", "mac_address", "serial_number"]
    readonly_fields = [
        "last_seen_at",
        "last_status_code",
        "last_status_text",
        "printing_in_progress",
        "current_job_token",
        "supported_media_types",
        "last_error",
        "created_at",
        "updated_at",
    ]


@admin.register(FestivalPrintJob)
class FestivalPrintJobAdmin(admin.ModelAdmin):
    list_display = [
        "job_token",
        "order",
        "job_type",
        "sequence",
        "status",
        "is_reprint",
        "attempt_count",
        "created_at",
        "completed_at",
    ]
    list_filter = ["status", "job_type", "is_reprint", "printer", "created_at"]
    search_fields = ["job_token", "batch_uuid", "order__id"]
    readonly_fields = [f.name for f in FestivalPrintJob._meta.fields]
    actions = ["retry_failed_action", "reprint_order_action"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.action(description="Retry selected FAILED jobs (new tokens)")
    def retry_failed_action(self, request, queryset):
        ok = 0
        for job in queryset.filter(status=FestivalPrintJob.Status.FAILED):
            try:
                create_retry_job(job)
                ok += 1
            except CloudPRNTError as exc:
                messages.error(request, f"{job.job_token}: {exc}")
        if ok:
            messages.success(request, f"Created {ok} retry job(s).")

    @admin.action(description="Reprint order tickets as COPY (new batch)")
    def reprint_order_action(self, request, queryset):
        orders = {job.order_id: job.order for job in queryset.select_related("order")}
        ok = 0
        for order in orders.values():
            try:
                create_reprint_batch(order, is_copy=True)
                ok += 1
            except CloudPRNTError as exc:
                messages.error(request, f"Order {order.pk}: {exc}")
        if ok:
            messages.success(request, f"Queued COPY reprints for {ok} order(s).")


@admin.register(FestivalNumberSequence)
class FestivalNumberSequenceAdmin(admin.ModelAdmin):
    list_display = ["document_type", "last_number"]
    readonly_fields = ["document_type", "last_number"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
