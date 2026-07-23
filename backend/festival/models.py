from __future__ import annotations

import hashlib
import re
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


def normalize_mac_address(value: str) -> str:
    """Normalize a MAC address to 12 uppercase hex characters (no separators)."""
    if value is None:
        raise ValidationError("MAC address is required.")
    cleaned = re.sub(r"[^0-9A-Fa-f]", "", str(value).strip())
    if len(cleaned) != 12:
        raise ValidationError("MAC address must contain exactly 12 hexadecimal characters.")
    return cleaned.upper()


def payload_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


FESTIVAL_TICKET_SEQUENCE_MAX = 99


class FestivalCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]
        verbose_name = "Festival category"
        verbose_name_plural = "Festival categories"

    def __str__(self) -> str:
        return self.name


class FestivalAdditionClass(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Addition class"
        verbose_name_plural = "Addition classes"

    def __str__(self) -> str:
        return self.name


class FestivalAddition(models.Model):
    name = models.CharField(max_length=200)
    addition_class = models.ForeignKey(
        FestivalAdditionClass,
        on_delete=models.PROTECT,
        related_name="additions",
    )
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="VAT-inclusive addition price (default £0.00).",
    )

    class Meta:
        ordering = ["addition_class__name", "name"]
        verbose_name = "Addition"
        verbose_name_plural = "Additions"
        constraints = [
            models.CheckConstraint(
                condition=Q(price__gte=0),
                name="festival_addition_price_non_negative",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} (£{self.price})"

    def clean(self):
        if self.price is not None and self.price < 0:
            raise ValidationError({"price": "Price cannot be negative."})


class FestivalProduct(models.Model):
    category = models.ForeignKey(
        FestivalCategory,
        on_delete=models.PROTECT,
        related_name="products",
        null=True,
        blank=True,
    )
    addition_class = models.ForeignKey(
        FestivalAdditionClass,
        on_delete=models.PROTECT,
        related_name="products",
        null=True,
        blank=True,
        help_text="Additions from this class can be chosen with the product.",
    )
    name = models.CharField(max_length=200)
    image_url = models.URLField(blank=True, default="", max_length=500)
    vat_rate = models.DecimalField(
        max_digits=3,
        decimal_places=0,
        default=Decimal("0"),
        help_text="VAT percentage (0, 5, 20, …).",
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="VAT-inclusive retail price.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category__created_at", "category__id", "created_at", "id"]
        permissions = [
            ("place_festival_order", "Can place festival orders"),
            ("cancel_festival_order", "Can cancel festival orders"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(price__gte=0),
                name="festival_product_price_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(vat_rate__gte=0) & Q(vat_rate__lte=100),
                name="festival_product_vat_rate_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} (£{self.price})"

    def clean(self):
        if self.price is not None and self.price < 0:
            raise ValidationError({"price": "Price cannot be negative."})
        if self.vat_rate is not None and (
            self.vat_rate < 0 or self.vat_rate > 100
        ):
            raise ValidationError({"vat_rate": "VAT rate must be between 0 and 100."})


class FestivalFilling(models.Model):
    """
    A variant of a product (e.g. Varenyky fillings: potato, cheese, meat).

    Fillings share the parent product's price, VAT rate, image and addition
    class. Deleting a product cascades to its fillings; order items keep
    filling_name snapshots and null out the FK (SET_NULL).
    """

    product = models.ForeignKey(
        FestivalProduct,
        on_delete=models.CASCADE,
        related_name="fillings",
    )
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Filling"
        verbose_name_plural = "Fillings"
        constraints = [
            models.UniqueConstraint(
                fields=["product", "name"],
                name="festival_filling_unique_per_product",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.product.name} — {self.name}"


class FestivalNumberSequence(models.Model):
    """
    Per-document counter rows.

    Only the TICKET row cycles 1–99 for display ticket numbers.
    Invoice and credit-note rows increment monotonically without wrapping.
    """

    class DocumentType(models.TextChoices):
        TICKET = "TICKET", "Ticket"
        FE_INVOICE = "FE_INVOICE", "Festival Invoice"
        FE_CREDIT_NOTE = "FE_CREDIT_NOTE", "Festival Credit Note"

    TICKET_MAX = FESTIVAL_TICKET_SEQUENCE_MAX

    document_type = models.CharField(
        max_length=20,
        choices=DocumentType.choices,
        unique=True,
    )
    last_number = models.PositiveBigIntegerField(
        default=0,
        help_text=(
            "Ticket: last allocated display number (0–99, wraps to 1). "
            "Invoice/credit note: last allocated document number (no wrap)."
        ),
    )

    class Meta:
        ordering = ["document_type"]
        verbose_name = "Festival number sequence"
        verbose_name_plural = "Festival number sequences"
        constraints = [
            models.CheckConstraint(
                condition=~Q(document_type="TICKET")
                | Q(last_number__lte=FESTIVAL_TICKET_SEQUENCE_MAX),
                name="festival_ticket_sequence_max_99",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_document_type_display()} (last={self.last_number})"

    def clean(self):
        if (
            self.document_type == self.DocumentType.TICKET
            and self.last_number > self.TICKET_MAX
        ):
            raise ValidationError(
                {
                    "last_number": (
                        f"Ticket sequence must stay between 0 and {self.TICKET_MAX}."
                    )
                }
            )


class FestivalOrder(models.Model):
    class Status(models.TextChoices):
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

    order_number = models.PositiveSmallIntegerField(
        help_text="Rotating display ticket number 1–99.",
    )
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    client_request_id = models.UUIDField(unique=True)
    request_fingerprint = models.CharField(max_length=64)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PAID,
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="festival_orders",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["order_number", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["order_number", "id"],
                name="festival_order_number_id_unique",
            ),
            models.CheckConstraint(
                condition=Q(order_number__gte=1)
                & Q(order_number__lte=FESTIVAL_TICKET_SEQUENCE_MAX),
                name="festival_order_number_range",
            ),
            models.CheckConstraint(
                condition=Q(total_price__gte=0),
                name="festival_order_total_non_negative",
            ),
        ]

    def __str__(self) -> str:
        return f"Festival order #{self.order_number} (id={self.pk})"

    @property
    def is_cancelled(self) -> bool:
        return self.status == self.Status.CANCELLED


class FestivalOrderItem(models.Model):
    order = models.ForeignKey(
        FestivalOrder,
        on_delete=models.PROTECT,
        related_name="items",
    )
    product = models.ForeignKey(
        FestivalProduct,
        on_delete=models.SET_NULL,
        related_name="order_items",
        null=True,
        blank=True,
        help_text="May be null if the product was deleted; use product_name snapshot.",
    )
    filling = models.ForeignKey(
        FestivalFilling,
        on_delete=models.SET_NULL,
        related_name="order_items",
        null=True,
        blank=True,
        help_text="May be null if the filling was deleted; use filling_name snapshot.",
    )
    addition = models.ForeignKey(
        FestivalAddition,
        on_delete=models.SET_NULL,
        related_name="order_items",
        null=True,
        blank=True,
        help_text="May be null if the addition was deleted; use addition_name snapshot.",
    )
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
    )
    product_name = models.CharField(max_length=200)
    filling_name = models.CharField(max_length=100, blank=True, default="")
    addition_name = models.CharField(max_length=200, blank=True, default="")
    addition_unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="VAT-inclusive addition unit price snapshot.",
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="VAT-inclusive combined unit price snapshot (product + addition).",
    )
    vat_rate = models.DecimalField(
        max_digits=3,
        decimal_places=0,
        help_text="VAT percentage snapshot.",
    )
    line_net = models.DecimalField(max_digits=10, decimal_places=2)
    line_vat = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "product", "filling", "addition"],
                name="festival_order_item_unique_product_filling_addition",
            ),
            models.CheckConstraint(
                condition=Q(quantity__gte=1),
                name="festival_order_item_quantity_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.quantity} × {self.display_name}"

    @property
    def display_name(self) -> str:
        name = self.product_name
        if self.filling_name:
            name = f"{name} ({self.filling_name})"
        if self.addition_name:
            name = f"{name} + {self.addition_name}"
        return name

    def clean(self):
        if self.pk:
            prev = FestivalOrderItem.objects.get(pk=self.pk)
            for field in (
                "order_id",
                "product_id",
                "filling_id",
                "addition_id",
                "quantity",
                "product_name",
                "filling_name",
                "addition_name",
                "addition_unit_price",
                "unit_price",
                "vat_rate",
                "line_net",
                "line_vat",
                "line_total",
            ):
                if getattr(prev, field) != getattr(self, field):
                    raise ValidationError(
                        "Festival order items are immutable snapshots."
                    )


class FestivalInvoice(models.Model):
    class Status(models.TextChoices):
        PAID = "PAID", "Paid"
        CREDITED = "CREDITED", "Credited"

    order = models.OneToOneField(
        FestivalOrder,
        on_delete=models.PROTECT,
        related_name="invoice",
    )
    invoice_number = models.CharField(max_length=32, unique=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PAID,
    )
    issued_at = models.DateTimeField()
    subtotal_net = models.DecimalField(max_digits=10, decimal_places=2)
    vat_total = models.DecimalField(max_digits=10, decimal_places=2)
    total_gross = models.DecimalField(max_digits=10, decimal_places=2)
    seller_snapshot = models.JSONField(default=dict)
    vat_breakdown = models.JSONField(
        default=dict,
        help_text="VAT totals grouped by rate percentage.",
    )
    pdf_key = models.CharField(max_length=255, blank=True, default="")
    credited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-issued_at"]
        indexes = [
            models.Index(fields=["invoice_number"]),
            models.Index(fields=["status", "issued_at"]),
        ]

    def __str__(self) -> str:
        return f"Festival invoice {self.invoice_number}"

    def clean(self):
        if self.pk:
            prev = FestivalInvoice.objects.get(pk=self.pk)
            immutable = [
                "order_id",
                "invoice_number",
                "issued_at",
                "subtotal_net",
                "vat_total",
                "total_gross",
                "seller_snapshot",
                "vat_breakdown",
            ]
            for field in immutable:
                if getattr(prev, field) != getattr(self, field):
                    raise ValidationError(
                        "Festival invoices are immutable after issuance."
                    )
            if prev.pdf_key and self.pdf_key != prev.pdf_key:
                raise ValidationError("Published invoice PDF key cannot change.")


class FestivalCreditNote(models.Model):
    invoice = models.OneToOneField(
        FestivalInvoice,
        on_delete=models.PROTECT,
        related_name="credit_note",
    )
    credit_note_number = models.CharField(max_length=32, unique=True)
    issued_at = models.DateTimeField()
    reason = models.TextField(blank=True, default="")
    original_invoice_number = models.CharField(max_length=32)
    subtotal_net = models.DecimalField(max_digits=10, decimal_places=2)
    vat_total = models.DecimalField(max_digits=10, decimal_places=2)
    total_gross = models.DecimalField(max_digits=10, decimal_places=2)
    seller_snapshot = models.JSONField(default=dict)
    vat_breakdown = models.JSONField(default=dict)
    pdf_key = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["-issued_at"]
        indexes = [
            models.Index(fields=["credit_note_number"]),
        ]

    def __str__(self) -> str:
        return f"Festival credit note {self.credit_note_number}"

    def clean(self):
        if self.pk:
            prev = FestivalCreditNote.objects.get(pk=self.pk)
            immutable = [
                "invoice_id",
                "credit_note_number",
                "issued_at",
                "reason",
                "original_invoice_number",
                "subtotal_net",
                "vat_total",
                "total_gross",
                "seller_snapshot",
                "vat_breakdown",
            ]
            for field in immutable:
                if getattr(prev, field) != getattr(self, field):
                    raise ValidationError(
                        "Festival credit notes are immutable after issuance."
                    )
            if prev.pdf_key and self.pdf_key != prev.pdf_key:
                raise ValidationError("Published credit-note PDF key cannot change.")


class FestivalPrinter(models.Model):
    name = models.CharField(max_length=100, default="Festival printer")
    mac_address = models.CharField(
        max_length=12,
        unique=True,
        help_text="Ethernet MAC as 12 uppercase hex characters.",
    )
    unique_id = models.CharField(max_length=64, blank=True, default="")
    serial_number = models.CharField(max_length=64, blank=True, default="")
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    last_status_code = models.CharField(max_length=64, blank=True, default="")
    last_status_text = models.CharField(max_length=255, blank=True, default="")
    printing_in_progress = models.BooleanField(default=False)
    current_job_token = models.UUIDField(null=True, blank=True)
    supported_media_types = models.JSONField(default=list, blank=True)
    last_error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=Q(is_active=True),
                name="festival_one_active_printer",
            ),
        ]

    def __str__(self) -> str:
        state = "active" if self.is_active else "inactive"
        return f"{self.name} ({self.mac_address}, {state})"

    def clean(self):
        self.mac_address = normalize_mac_address(self.mac_address)

    def save(self, *args, **kwargs):
        self.mac_address = normalize_mac_address(self.mac_address)
        super().save(*args, **kwargs)

    @property
    def is_online(self) -> bool:
        if not self.is_active or not self.last_seen_at:
            return False
        stale = int(getattr(settings, "FESTIVAL_PRINTER_STALE_SECONDS", 60))
        age = (timezone.now() - self.last_seen_at).total_seconds()
        if age > stale:
            return False
        code = (self.last_status_code or "").strip()
        # Online for operational 2xx; paper-low (211) still printable.
        if not code:
            return True
        try:
            numeric = int(code.split()[0])
        except (ValueError, IndexError):
            return False
        return 200 <= numeric < 300 and numeric not in (220, 221)


class FestivalPrintBatch(models.Model):
    """
    Denormalized queue metadata for a print batch (batch_uuid).

    Kept in sync on job status transitions so claim selection is a simple
    indexed ORDER BY … LIMIT 1 instead of correlated Exists/Subquery scans.
    """

    id = models.UUIDField(primary_key=True, editable=False)
    printer = models.ForeignKey(
        FestivalPrinter,
        on_delete=models.CASCADE,
        related_name="print_batches",
    )
    has_failed = models.BooleanField(default=False)
    has_progress = models.BooleanField(default=False)
    ready_count = models.PositiveIntegerField(default=0)
    queue_available_at = models.DateTimeField()
    queue_created_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(
                fields=[
                    "printer",
                    "has_failed",
                    "ready_count",
                    "has_progress",
                    "queue_available_at",
                ],
                name="festival_batch_claim_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"PrintBatch {self.id} ready={self.ready_count}"


class FestivalPrintJob(models.Model):
    class JobType(models.TextChoices):
        KITCHEN = "KITCHEN", "Kitchen"
        CUSTOMER = "CUSTOMER", "Customer"
        KITCHEN_CANCELLATION = "KITCHEN_CANCELLATION", "Kitchen cancellation"
        CUSTOMER_CREDIT = "CUSTOMER_CREDIT", "Customer credit"

    class Status(models.TextChoices):
        READY = "READY", "Ready"
        CLAIMED = "CLAIMED", "Claimed"
        PRINTED = "PRINTED", "Printed"
        FAILED = "FAILED", "Failed"
        CANCELLED = "CANCELLED", "Cancelled"

    class CompletionSource(models.TextChoices):
        DELETE = "DELETE", "DELETE acknowledgement"
        INFERRED_FROM_POLL = "INFERRED_FROM_POLL", "Inferred from poll"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job_token = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    batch_uuid = models.UUIDField(db_index=True)
    order = models.ForeignKey(
        FestivalOrder,
        on_delete=models.PROTECT,
        related_name="print_jobs",
    )
    printer = models.ForeignKey(
        FestivalPrinter,
        on_delete=models.PROTECT,
        related_name="print_jobs",
    )
    job_type = models.CharField(max_length=32, choices=JobType.choices)
    sequence = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.READY,
        db_index=True,
    )
    media_type = models.CharField(max_length=64, default="text/plain")
    payload_text = models.TextField()
    payload_checksum = models.CharField(max_length=64)
    is_reprint = models.BooleanField(default=False)
    retry_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="retries",
    )
    available_at = models.DateTimeField(default=timezone.now)
    claimed_at = models.DateTimeField(null=True, blank=True)
    fetched_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completion_source = models.CharField(
        max_length=32,
        choices=CompletionSource.choices,
        blank=True,
        default="",
    )
    attempt_count = models.PositiveIntegerField(default=0)
    # Count of READY↔CLAIMED stale recoveries only (not GET fetch attempts).
    stale_requeue_count = models.PositiveIntegerField(default=0)
    last_result_code = models.CharField(max_length=64, blank=True, default="")
    last_error = models.TextField(blank=True, default="")
    audit_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["available_at", "sequence", "created_at"]
        indexes = [
            models.Index(fields=["printer", "status", "available_at"]),
            models.Index(fields=["batch_uuid", "sequence"]),
            models.Index(fields=["order"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["batch_uuid", "sequence"],
                name="festival_print_batch_sequence_unique",
            ),
            models.CheckConstraint(
                condition=Q(sequence__gte=1),
                name="festival_print_sequence_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.job_type} job {self.job_token} ({self.status})"

    def clean(self):
        if self.payload_text and not self.payload_checksum:
            self.payload_checksum = payload_sha256(self.payload_text)
        if self.pk:
            prev = FestivalPrintJob.objects.get(pk=self.pk)
            if prev.status != self.Status.READY or self.status != self.Status.READY:
                immutable = (
                    "payload_text",
                    "payload_checksum",
                    "media_type",
                    "order_id",
                    "job_type",
                    "sequence",
                    "job_token",
                    "batch_uuid",
                )
                for field in immutable:
                    if getattr(prev, field) != getattr(self, field):
                        raise ValidationError(
                            f"Cannot modify immutable print-job field {field}."
                        )
