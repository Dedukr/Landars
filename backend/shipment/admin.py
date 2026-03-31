from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.http import HttpResponseNotAllowed
from django.shortcuts import redirect
from django.urls import path, reverse
from django.utils.html import escape, format_html

from .models import Shipment, ShipmentParcel
from .order_shipping import OrderShippingService


def _tracking_url_link_html(raw: str | None) -> str:
    """Clickable tracking URL with a short label (no long URL text in admin)."""
    s = (raw or "").strip()
    if not s:
        return format_html('<span class="help">—</span>')
    if s.startswith(("http://", "https://")):
        return format_html(
            '<a href="{}" target="_blank" rel="noopener noreferrer">'
            "Open carrier tracking</a>",
            s,
        )
    return escape(s)


class ShipmentParcelInline(admin.StackedInline):
    model = ShipmentParcel
    extra = 0
    can_delete = False
    readonly_fields = (
        "sendcloud_parcel_id",
        "tracking_number",
        "carrier_code",
        "parcel_tracking_url_link",
        "created_at",
    )

    @admin.display(description="Tracking URL (Sendcloud)")
    def parcel_tracking_url_link(self, obj: ShipmentParcel) -> str:
        if not obj.pk:
            return "—"
        return _tracking_url_link_html(obj.tracking_url)


@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    change_form_template = "admin/shipment/shipment/change_form.html"

    list_display = (
        "id",
        "order_admin_link",
        "label_link",
        "provider_tracking",
        "provider_parcel_id",
        "status",
        "retry_count",
        "logical_shipping_option",
        "total_weight_kg",
        "sendcloud_order_reference",
        "created_at",
    )
    list_filter = ("status", "logical_shipping_option")
    search_fields = ("order__id", "sendcloud_order_reference")

    readonly_fields = (
        "order",
        "status",
        "logical_shipping_option",
        "address_snapshot",
        "item_lines_snapshot",
        "total_weight_kg",
        "packaging_weight_kg",
        "total_order_value",
        "total_order_value_currency",
        "total_item_quantity",
        "sender_address_id",
        "sendcloud_order_reference",
        "provider_summary",
        "sendcloud_tracking_url_display",
        "label_link",
        "last_error",
        "retry_count",
        "created_at",
        "updated_at",
    )
    inlines = [ShipmentParcelInline]
    ordering = ("-created_at",)

    fieldsets = (
        (
            None,
            {
                "fields": (
                    "order",
                    "sendcloud_order_reference",
                    "status",
                    "logical_shipping_option",
                ),
            },
        ),
        (
            "Sendcloud (stored)",
            {
                "description": "Identifiers and links derived from persisted parcel data only.",
                "fields": (
                    "provider_summary",
                    "sendcloud_tracking_url_display",
                ),
            },
        ),
        (
            "Label",
            {
                "fields": ("label_link",),
            },
        ),
        (
            "Errors & retries",
            {
                "fields": ("last_error", "retry_count"),
            },
        ),
        (
            "Frozen snapshot",
            {
                "classes": ("collapse",),
                "fields": (
                    "address_snapshot",
                    "item_lines_snapshot",
                    "total_weight_kg",
                    "packaging_weight_kg",
                    "total_order_value",
                    "total_order_value_currency",
                    "total_item_quantity",
                    "sender_address_id",
                ),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
            },
        ),
    )

    def get_queryset(self, request):  # type: ignore[override]
        return super().get_queryset(request).select_related("order", "parcel")

    def get_urls(self):
        info = self.model._meta.app_label, self.model._meta.model_name
        return [
            path(
                "<path:object_id>/retry-label-download/",
                self.admin_site.admin_view(self.retry_label_download_view),
                name="%s_%s_retry_label_download" % info,
            ),
            path(
                "<path:object_id>/retry-shipment-creation/",
                self.admin_site.admin_view(self.retry_shipment_creation_view),
                name="%s_%s_retry_shipment_creation" % info,
            ),
            path(
                "<path:object_id>/recreate-sendcloud-parcel/",
                self.admin_site.admin_view(self.recreate_sendcloud_parcel_view),
                name="%s_%s_recreate_sendcloud_parcel" % info,
            ),
        ] + super().get_urls()

    def render_change_form(
        self, request, context, add=False, change=False, form_url="", obj=None
    ):
        """
        Inject Operations URLs on every change-form render (same behavior for edit
        and “view” style pages) so the custom change_form template always receives them.
        """
        if (
            not add
            and obj is not None
            and self.has_change_permission(request, obj=obj)
        ):
            app_label = self.model._meta.app_label
            model_name = self.model._meta.model_name
            oid = obj.pk
            context["shipment_ops_retry"] = {
                "retry_label_url": reverse(
                    f"admin:{app_label}_{model_name}_retry_label_download",
                    args=[oid],
                ),
                "retry_creation_url": reverse(
                    f"admin:{app_label}_{model_name}_retry_shipment_creation",
                    args=[oid],
                ),
                "recreate_parcel_url": reverse(
                    f"admin:{app_label}_{model_name}_recreate_sendcloud_parcel",
                    args=[oid],
                ),
            }
        else:
            context["shipment_ops_retry"] = None
        return super().render_change_form(
            request, context, add=add, change=change, form_url=form_url, obj=obj
        )

    def retry_label_download_view(self, request, object_id):
        if request.method != "POST":
            return HttpResponseNotAllowed(["POST"])
        if not self.has_change_permission(request):
            from django.core.exceptions import PermissionDenied

            raise PermissionDenied
        obj = self.get_object(request, object_id)
        if obj is None:
            self.message_user(request, "Shipment not found.", level=messages.WARNING)
            return redirect(
                "admin:%s_%s_changelist"
                % (self.model._meta.app_label, self.model._meta.model_name)
            )
        ok, msg = OrderShippingService.admin_queue_label_download_retry(obj.pk)
        self.message_user(
            request,
            msg,
            level=messages.SUCCESS if ok else messages.WARNING,
        )
        return redirect(
            "admin:%s_%s_change"
            % (self.model._meta.app_label, self.model._meta.model_name),
            object_id,
        )

    def retry_shipment_creation_view(self, request, object_id):
        if request.method != "POST":
            return HttpResponseNotAllowed(["POST"])
        if not self.has_change_permission(request):
            from django.core.exceptions import PermissionDenied

            raise PermissionDenied
        obj = self.get_object(request, object_id)
        if obj is None:
            self.message_user(request, "Shipment not found.", level=messages.WARNING)
            return redirect(
                "admin:%s_%s_changelist"
                % (self.model._meta.app_label, self.model._meta.model_name)
            )
        ok, msg = OrderShippingService.admin_queue_shipment_creation_retry(obj.pk)
        self.message_user(
            request,
            msg,
            level=messages.SUCCESS if ok else messages.WARNING,
        )
        return redirect(
            "admin:%s_%s_change"
            % (self.model._meta.app_label, self.model._meta.model_name),
            object_id,
        )

    def recreate_sendcloud_parcel_view(self, request, object_id):
        if request.method != "POST":
            return HttpResponseNotAllowed(["POST"])
        if not self.has_change_permission(request):
            from django.core.exceptions import PermissionDenied

            raise PermissionDenied
        obj = self.get_object(request, object_id)
        if obj is None:
            self.message_user(request, "Shipment not found.", level=messages.WARNING)
            return redirect(
                "admin:%s_%s_changelist"
                % (self.model._meta.app_label, self.model._meta.model_name)
            )
        ok, msg = OrderShippingService.admin_recreate_sendcloud_parcel_from_order(
            obj.pk
        )
        self.message_user(
            request,
            msg,
            level=messages.SUCCESS if ok else messages.WARNING,
        )
        return redirect(
            "admin:%s_%s_change"
            % (self.model._meta.app_label, self.model._meta.model_name),
            object_id,
        )

    @admin.display(description="Order", ordering="order_id")
    def order_admin_link(self, obj: Shipment) -> str:
        oid = obj.order_id
        url = reverse("admin:api_order_change", args=[oid])
        return format_html(
            '<a href="{}" title="Order ID {}">Order {} by {}</a>',
            url,
            oid,
            obj.order.id,
            obj.order.customer.name,
        )

    @admin.display(description="Parcel ID")
    def provider_parcel_id(self, obj: Shipment) -> str:
        p = getattr(obj, "parcel", None)
        if p is None:
            return "—"
        return str(p.sendcloud_parcel_id)

    @admin.display(description="Tracking #")
    def provider_tracking(self, obj: Shipment) -> str:
        p = getattr(obj, "parcel", None)
        if p is None or not p.tracking_number:
            return "—"
        return p.tracking_number

    @admin.display(description="Provider parcel (stored)")
    def provider_summary(self, obj: Shipment) -> str:
        p = getattr(obj, "parcel", None)
        if p is None:
            return format_html(
                '<span class="help">No parcel row yet — shipment not announced at Sendcloud.</span>'
            )
        bits = [
            f"<strong>Parcel ID</strong>: {escape(str(p.sendcloud_parcel_id))}",
            f"<strong>Tracking</strong>: {escape(p.tracking_number or '—')}",
            f"<strong>Carrier</strong>: {escape(p.carrier_code or '—')}",
        ]
        return format_html("<br>".join(bits))

    @admin.display(description="Tracking URL (Sendcloud)")
    def sendcloud_tracking_url_display(self, obj: Shipment) -> str:
        p = getattr(obj, "parcel", None)
        if p is None:
            return "—"
        return _tracking_url_link_html(p.tracking_url)

    @admin.display(description="Label PDF (S3)")
    def label_link(self, obj: Shipment) -> str:
        if not (obj.label_s3_key or "").strip():
            return format_html(
                '<span class="help">No file in S3 yet — use “Retry label download” after the '
                "parcel exists.</span>"
            )
        try:
            url = obj.get_presigned_label_url()
        except (ValidationError, Exception):
            return format_html(
                '<span class="help">Label key set but URL could not be generated '
                "(check AWS credentials / bucket).</span>"
            )
        return format_html(
            '<a href="{}" target="_blank" rel="noopener noreferrer">Download shipping label</a>',
            url,
        )


@admin.register(ShipmentParcel)
class ShipmentParcelAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "shipment",
        "sendcloud_parcel_id",
        "tracking_number",
        "carrier_code",
        "tracking_url_link",
        "created_at",
    )
    search_fields = ("tracking_number", "sendcloud_parcel_id")
    readonly_fields = (
        "shipment",
        "sendcloud_parcel_id",
        "tracking_number",
        "carrier_code",
        "tracking_url_link",
        "created_at",
    )

    @admin.display(description="Tracking URL")
    def tracking_url_link(self, obj: ShipmentParcel) -> str:
        return _tracking_url_link_html(obj.tracking_url)
