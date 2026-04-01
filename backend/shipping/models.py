from django.core.exceptions import ValidationError
from django.db import models


class Shipment(models.Model):
    """
    Minimal courier row: frozen Sendcloud inputs (JSON), FSM ``status``, parcel id,
    label URL, tracking, S3 label key. Checkout stores ``shipping_method_id`` only;
    everything else needed to POST /parcels lives in ``sendcloud_inputs``.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Checkout (no courier snapshot yet)"
        PENDING = "pending", "Pending (snapshot)"
        QUEUED = "queued", "Queued"
        CREATING = "creating", "Creating"
        LABEL_DOWNLOAD_PENDING = (
            "label_download_pending",
            "Label download pending",
        )
        LABEL_DOWNLOAD_FAILED = (
            "label_download_failed",
            "Label download failed",
        )
        LABEL_READY = "label_ready", "Label file ready"
        FAILED_RETRYABLE = "failed_retryable", "Failed (retryable)"
        FAILED_FINAL = "failed_final", "Failed (final)"
        CANCELLED = "cancelled", "Cancelled"

    order = models.OneToOneField(
        "api.Order",
        on_delete=models.CASCADE,
        related_name="shipping_details",
    )
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    shipping_method_id = models.IntegerField(
        blank=True,
        null=True,
        help_text="Sendcloud method id from checkout (used when still valid for route/weight).",
    )
    sendcloud_inputs = models.JSONField(
        default=dict,
        help_text=(
            "Frozen parcel-creation payload: address_snapshot, item_lines_snapshot, "
            "logical_shipping_option, total_weight_kg, total_order_value, "
            "total_item_quantity, sender_address_id, sendcloud_order_reference (strings/decimals as JSON)."
        ),
    )

    sendcloud_parcel_id = models.BigIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Sendcloud parcel id after POST /parcels.",
    )
    carrier_code = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="Carrier code from Sendcloud (tracking URL fallback).",
    )
    provider_label_url = models.URLField(
        max_length=600,
        blank=True,
        default="",
        help_text="Sendcloud label PDF URL (download). Exposed on order API as shipping_label_url.",
    )
    shipping_tracking_number = models.CharField(
        max_length=255,
        blank=True,
        null=True,
    )
    shipping_tracking_url = models.URLField(
        max_length=600,
        blank=True,
        null=True,
    )
    label_s3_key = models.CharField(
        max_length=512,
        blank=True,
        default="",
        help_text="S3 key for stored label PDF.",
    )

    last_error = models.TextField(
        blank=True,
        help_text="Last pipeline / API error (cleared on success).",
    )
    retry_count = models.PositiveIntegerField(
        default=0,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "shipping_shipment"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["status", "created_at"],
                name="shipping_sh_status_crtd_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"Shipment {self.pk} (order {self.order_id}) — {self.status}"

    def has_courier_snapshot(self) -> bool:
        s = self.sendcloud_inputs or {}
        return bool(
            s.get("logical_shipping_option")
            and s.get("total_weight_kg") is not None
            and s.get("sender_address_id") is not None
            and s.get("total_order_value") not in (None, "")
            and s.get("total_item_quantity") not in (None, "")
        )

    def get_tracking_url(self) -> str:
        u = (self.shipping_tracking_url or "").strip()
        if u.startswith(("http://", "https://")):
            return u
        tn = (self.shipping_tracking_number or "").strip()
        if not tn:
            return ""
        code = (self.carrier_code or "").lower().replace(" ", "_").replace("-", "_")
        if "royal" in code:
            return (
                "https://www.royalmail.com/track-your-item#/tracking-results/"
                + tn
            )
        return ""

    def has_stored_label_file(self) -> bool:
        return bool((self.label_s3_key or "").strip())

    def is_label_fully_stored(self) -> bool:
        return self.has_stored_label_file()

    def get_presigned_label_url(self, expires_in: int = 300) -> str:
        key = (self.label_s3_key or "").strip()
        if not key:
            raise ValidationError("Shipment has no label PDF in S3 (label_s3_key empty).")
        from django.conf import settings

        from billing.models import get_s3_client

        s3 = get_s3_client()
        return s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                "Key": key,
            },
            ExpiresIn=expires_in,
        )
