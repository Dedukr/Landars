from django.core.exceptions import ValidationError
from django.db import models


class Shipment(models.Model):
    """
    Frozen snapshot for post (non-home) delivery: address, lines, weight.
    Sendcloud submission runs asynchronously via Celery.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        QUEUED = "queued", "Queued"
        CREATING = "creating", "Creating"
        PROVIDER_CREATED = "provider_created", "Provider parcel created"
        LABEL_READY = "label_ready", "Label file ready"
        LABEL_CREATED = "label_created", "Label created (legacy)"
        FAILED_RETRYABLE = "failed_retryable", "Failed (retryable)"
        FAILED_FINAL = "failed_final", "Failed (final)"
        CANCELLED = "cancelled", "Cancelled"

    class LabelDownloadStatus(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"

    class LogicalShippingOption(models.TextChoices):
        UK_STANDARD_SMALL_PARCEL = "uk_standard_small_parcel", "UK standard small parcel"
        UK_TRACKED_24 = "uk_tracked_24", "UK Tracked 24"
        UK_TRACKED_48 = "uk_tracked_48", "UK Tracked 48"

    order = models.OneToOneField(
        "api.Order",
        on_delete=models.CASCADE,
        related_name="post_shipment",
    )
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    logical_shipping_option = models.CharField(
        max_length=64,
        choices=LogicalShippingOption.choices,
        help_text="Internal option; resolved to a live Sendcloud method ID at ship time.",
    )

    address_snapshot = models.JSONField(
        default=dict,
        help_text="Recipient name, address lines, city, postcode, country, phone, email.",
    )
    item_lines_snapshot = models.JSONField(
        default=list,
        help_text="Order lines: product id, name, qty, unit weight, line total.",
    )
    total_weight_kg = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        help_text="Sum of line weights (goods only) at snapshot time, kilograms.",
    )
    packaging_weight_kg = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        default=0,
        help_text="Kept for schema compatibility; always 0 — billable weight uses goods only.",
    )
    total_order_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Frozen declared value for carrier/customs (typically goods subtotal).",
    )
    total_order_value_currency = models.CharField(max_length=3, default="GBP")
    total_item_quantity = models.PositiveIntegerField(
        help_text="Sum of line item units at snapshot time (manifest); not Sendcloud parcel multi-collo count.",
    )

    sender_address_id = models.PositiveIntegerField(
        help_text="Sendcloud sender address ID copied at creation for audit.",
    )
    sendcloud_order_reference = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Stable reference sent as Sendcloud parcel order_number (frozen at snapshot).",
    )

    provider_created_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When Sendcloud accepted the parcel (ShipmentParcel persisted).",
    )
    label_downloaded_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the label PDF was stored in S3 (see label_s3_key).",
    )
    label_s3_key = models.CharField(
        max_length=512,
        blank=True,
        default="",
        help_text=(
            "S3 object key for the label PDF (bucket AWS_STORAGE_BUCKET_NAME, "
            "region AWS_S3_REGION_NAME); same boto3 helpers as invoices."
        ),
    )
    label_download_status = models.CharField(
        max_length=16,
        choices=LabelDownloadStatus.choices,
        default=LabelDownloadStatus.NOT_STARTED,
        help_text="Local label file pipeline — independent of Sendcloud parcel creation.",
    )

    last_error = models.TextField(
        blank=True,
        help_text="Last Sendcloud API or label pipeline error (cleared on success).",
    )
    retry_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of failed Sendcloud attempts (incremented before each Celery retry).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"Shipment {self.pk} (order {self.order_id}) — {self.status}"

    def has_stored_label_file(self) -> bool:
        """True if a label PDF exists in S3 (``label_s3_key`` set)."""
        return bool((self.label_s3_key or "").strip())

    def is_label_fully_stored(self) -> bool:
        """True when the label PDF is recorded as stored in S3."""
        if (
            self.label_download_status == self.LabelDownloadStatus.SUCCESS
            and self.has_stored_label_file()
        ):
            return True
        return self.has_stored_label_file()

    def get_presigned_label_url(self, expires_in: int = 300) -> str:
        """Presigned GET URL for the label PDF (same pattern as invoice PDFs)."""
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


class ShipmentParcel(models.Model):
    """Sendcloud parcel response persisted after successful label creation."""

    shipment = models.OneToOneField(
        Shipment,
        on_delete=models.CASCADE,
        related_name="parcel",
    )
    sendcloud_parcel_id = models.BigIntegerField()
    tracking_number = models.CharField(max_length=255, blank=True)
    carrier_code = models.CharField(max_length=64, blank=True)
    tracking_url = models.URLField(
        max_length=600,
        blank=True,
        default="",
        help_text="Carrier tracking page URL from Sendcloud when provided.",
    )
    provider_label_url = models.URLField(
        max_length=600,
        blank=True,
        default="",
        help_text="Provider shipping-label URL (for re-download; authenticated).",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Parcel {self.sendcloud_parcel_id} — {self.tracking_number or 'no tracking'}"

    def get_tracking_url(self) -> str:
        """
        Public carrier tracking URL (stored ``tracking_url``, else known fallbacks).

        Does not call live APIs; suitable for admin “Open tracking” links.
        """
        u = (self.tracking_url or "").strip()
        if u.startswith(("http://", "https://")):
            return u
        tn = (self.tracking_number or "").strip()
        if not tn:
            return ""
        code = (self.carrier_code or "").lower().replace(" ", "_").replace("-", "_")
        if "royal" in code:
            return (
                "https://www.royalmail.com/track-your-item#/tracking-results/"
                + tn
            )
        return ""
