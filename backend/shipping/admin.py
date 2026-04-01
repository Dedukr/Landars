from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.http import HttpResponseNotAllowed
from django.shortcuts import redirect
from django.urls import path, reverse
from django.utils.html import escape, format_html

from .models import Shipment
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


@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    change_form_template = "admin/shipping/shipment/change_form.html"

    list_display = (
        "id",
        "order_admin_link",
        "label_link",
        "provider_tracking",
        "provider_parcel_id",
        "status",
        "retry_count",
        "sendcloud_logical_option",
        "shipping_method_id",
        "sendcloud_inputs_weight",
        "sendcloud_inputs_ref",
        "created_at",
    )
    list_filter = ("status",)
    search_fields = ("order__id", "shipping_tracking_number", "sendcloud_parcel_id")

    readonly_fields = (
        "order",
        "status",
        "shipping_method_id",
        "sendcloud_inputs",
        "provider_summary",
        "sendcloud_tracking_url_display",
        "stored_tracking_url_ro",
        "label_link",
        "last_error",
        "retry_count",
        "created_at",
        "updated_at",
        "sendcloud_parcel_id",
        "shipping_tracking_number",
        "carrier_code",
        "provider_label_url",
        "shipping_tracking_url",
        "label_s3_key",
        "db_storage_table",
    )
    ordering = ("-created_at",)

    fieldsets = (
        (
            None,
            {
                "fields": (
                    "order",
                    "status",
                    "shipping_method_id",
                    "retry_count",
                    "last_error",
                ),
            },
        ),
        (
            "Sendcloud (stored)",
            {
                "description": "Provider data after Sendcloud parcel creation (single row).",
                "fields": (
                    "sendcloud_parcel_id",
                    "shipping_tracking_number",
                    "carrier_code",
                    "stored_tracking_url_ro",
                    "provider_label_url",
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
            "Frozen inputs (JSON)",
            {
                "classes": ("collapse",),
                "fields": ("sendcloud_inputs",),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
            },
        ),
        (
            "Storage / ops",
            {
                "classes": ("collapse",),
                "description": 'Physical PostgreSQL name (Django app is "shipping"). See backend/shipping/README.md.',
                "fields": ("db_storage_table",),
            },
        ),
    )

    @admin.display(description="PostgreSQL table")
    def db_storage_table(self, obj: Shipment | None) -> str:
        return Shipment._meta.db_table

    def get_queryset(self, request):  # type: ignore[override]
        return super().get_queryset(request).select_related("order")

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

    @admin.display(description="Logical option")
    def sendcloud_logical_option(self, obj: Shipment) -> str:
        v = (obj.sendcloud_inputs or {}).get("logical_shipping_option")
        return v if v else "—"

    @admin.display(description="Weight (kg)")
    def sendcloud_inputs_weight(self, obj: Shipment) -> str:
        v = (obj.sendcloud_inputs or {}).get("total_weight_kg")
        return str(v) if v not in (None, "") else "—"

    @admin.display(description="Sendcloud order #")
    def sendcloud_inputs_ref(self, obj: Shipment) -> str:
        v = (obj.sendcloud_inputs or {}).get("sendcloud_order_reference")
        return v if v else "—"

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
        if not obj.sendcloud_parcel_id:
            return "—"
        return str(obj.sendcloud_parcel_id)

    @admin.display(description="Tracking #")
    def provider_tracking(self, obj: Shipment) -> str:
        tn = (obj.shipping_tracking_number or "").strip()
        if not tn:
            return "—"
        return tn

    @admin.display(description="Provider parcel (stored)")
    def provider_summary(self, obj: Shipment) -> str:
        if not obj.sendcloud_parcel_id:
            return format_html(
                '<span class="help">No parcel id yet — shipment not announced at Sendcloud.</span>'
            )
        bits = [
            f"<strong>Parcel ID</strong>: {escape(str(obj.sendcloud_parcel_id))}",
            f"<strong>Tracking</strong>: {escape(obj.shipping_tracking_number or '—')}",
            f"<strong>Carrier</strong>: {escape(obj.carrier_code or '—')}",
        ]
        return format_html("<br>".join(bits))

    @admin.display(description="Stored tracking URL")
    def stored_tracking_url_ro(self, obj: Shipment) -> str:
        return _tracking_url_link_html(
            getattr(obj, "shipping_tracking_url", None) or None
        )

    @admin.display(description="Tracking URL (resolved)")
    def sendcloud_tracking_url_display(self, obj: Shipment) -> str:
        if not obj.sendcloud_parcel_id:
            return "—"
        return _tracking_url_link_html(obj.get_tracking_url())

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
