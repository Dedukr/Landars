from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone


class InvoiceNumberSequence(models.Model):
    """
    Singleton-style row used to allocate sequential invoice numbers safely.
    """

    last_number = models.PositiveBigIntegerField(default=0)

    class Meta:
        verbose_name = "Invoice Number Sequence"
        verbose_name_plural = "Invoice Number Sequences"

    def __str__(self) -> str:
        return f"Invoice sequence (last={self.last_number})"


class Invoice(models.Model):
    class Status(models.TextChoices):
        ISSUED = "ISSUED", "Issued"
        PART_PAID = "PART_PAID", "Part paid"
        PAID = "PAID", "Paid"
        VOID = "VOID", "Void"

    # Immutable link to source order (invoice is an accounting snapshot of the order at issuance)
    # Changed to ForeignKey to allow multiple invoices per order (e.g., original + replacement)
    order = models.ForeignKey(
        "api.Order",
        on_delete=models.PROTECT,
        related_name="invoices",
    )

    invoice_number = models.PositiveBigIntegerField(
        unique=True,
        help_text="Sequential invoice number allocated at issuance.",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ISSUED,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    # Snapshot fields (immutable once issued)
    customer_snapshot = models.JSONField(default=dict)
    billing_address_snapshot = models.JSONField(default=dict)
    seller_snapshot = models.JSONField(default=dict)

    # Delivery/due date snapshot fields
    #
    # These are required on the invoice to keep it immutable and self-contained.
    # Temporary defaults for migration only; will be removed in next migration.
    delivery_date = models.DateField(default=timezone.localdate)
    delivery_date_order_id = models.PositiveIntegerField(default=0)

    # Totals snapshot
    holiday_fee_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, help_text="Percent (0-100)"
    )
    holiday_fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    delivery_fee_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    vat_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Payment tracking
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    paid_at = models.DateTimeField(null=True, blank=True)

    # PDF storage (S3 key) for rendered invoice document
    invoice_link = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="S3 key/path to the rendered invoice PDF (immutable once set).",
    )

    # Void metadata
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["invoice_number"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self) -> str:
        """Return string representation of invoice."""
        num = self.invoice_number if self.invoice_number is not None else "—"
        order_ref = f"order {self.order_id}" if self.order_id else "orphaned"
        return f"Invoice #{num} ({order_ref})"

    @property
    def due_date(self):
        """Invoice due date: 14 days from order creation date."""
        return self.created_at.date() + timezone.timedelta(days=14)

    @property
    def amount_due(self) -> Decimal:
        due = (self.total_amount or Decimal("0")) - (self.amount_paid or Decimal("0"))
        if due < 0:
            return Decimal("0")
        return due

    # ---------------------------------------------------------------------
    # Template compatibility / display helpers
    #
    # `backend/templates/invoice.html` historically referenced a few attributes
    # that lived on `Order` or used legacy naming. Keep them as read-only
    # properties so the accounting document can render reliably.
    # ---------------------------------------------------------------------

    @property
    def total(self) -> Decimal:
        """Legacy alias used by templates: total including VAT (inc VAT)."""
        return self.total_amount

    @property
    def total_vat(self) -> Decimal:
        """Legacy alias used by templates: VAT total across line items."""
        return self.vat_amount

    @property
    def subtotal_ex_vat(self) -> Decimal:
        """
        Subtotal excluding VAT.

        Includes delivery fee, and reflects other non-VAT adjustments shown in the summary.
        """
        return self.total_amount - self.vat_amount

    def clean(self):
        # Ensure sane money
        for field in [
            "holiday_fee_amount",
            "delivery_fee_amount",
            "discount_amount",
            "vat_amount",
            "total_amount",
            "amount_paid",
        ]:
            val = getattr(self, field)
            if val is not None and val < 0:
                raise ValidationError({field: "Must be non-negative."})

        # Production-grade immutability (without additional schema):
        # Once the invoice is published (invoice_link set), treat it as immutable.
        if self.pk:
            prev = Invoice.objects.get(pk=self.pk)
            if prev.invoice_link:
                immutable_fields = [
                    "order_id",
                    "invoice_number",
                    "customer_snapshot",
                    "billing_address_snapshot",
                    "seller_snapshot",
                    "holiday_fee_percent",
                    "holiday_fee_amount",
                    "delivery_fee_amount",
                    "discount_amount",
                    "vat_amount",
                    "total_amount",
                    "invoice_link",
                ]
                for f in immutable_fields:
                    if getattr(prev, f) != getattr(self, f):
                        raise ValidationError(
                            "Invoices are immutable accounting documents; they cannot be modified after publication."
                        )

    def _allocate_invoice_number(self) -> int:
        """
        Allocate the next sequential invoice number atomically.
        """
        with transaction.atomic():
            seq, _ = InvoiceNumberSequence.objects.select_for_update().get_or_create(
                pk=1, defaults={"last_number": 0}
            )
            seq.last_number += 1
            seq.save(update_fields=["last_number"])
            return int(seq.last_number)

    def allocate_invoice_number_if_needed(self):
        if self.invoice_number is None:
            self.invoice_number = self._allocate_invoice_number()

    def issue_from_order(self):
        """
        Populate immutable snapshot fields from the linked order.
        """
        order = self.order

        # Customer snapshot
        customer = order.customer
        profile = getattr(customer, "profile", None) if customer else None
        self.customer_snapshot = {
            "id": customer.id if customer else None,
            "name": getattr(customer, "name", None),
            "email": getattr(customer, "email", None),
            "phone": getattr(profile, "phone", None) if profile else None,
        }

        # Billing address snapshot (prefer explicit order.address; fallback to customer profile address)
        address = order.address
        if not address and profile:
            address = getattr(profile, "address", None)
        self.billing_address_snapshot = {
            "address_line": getattr(address, "address_line", None) if address else None,
            "address_line2": (
                getattr(address, "address_line2", None) if address else None
            ),
            "city": getattr(address, "city", None) if address else None,
            "postal_code": getattr(address, "postal_code", None) if address else None,
            "country": getattr(address, "country", None) if address else None,
        }

        # Seller snapshot (currently sourced from settings env-backed dict)
        self.seller_snapshot = dict(getattr(settings, "BUSINESS_INFO", {}) or {})

        # Delivery/due date snapshots
        # Validate that required fields are present
        delivery_date = getattr(order, "delivery_date", None)
        delivery_date_order_id = getattr(order, "delivery_date_order_id", None)

        if delivery_date is None or delivery_date_order_id is None:
            missing_fields = []
            if delivery_date is None:
                missing_fields.append("delivery_date")
            if delivery_date_order_id is None:
                missing_fields.append("delivery_date_order_id")
            raise ValidationError(
                f"Order {order.id} is missing required information for invoice creation: {', '.join(missing_fields)}. "
                f"Please update the order with the missing information before creating an invoice."
            )

        self.delivery_date = delivery_date
        self.delivery_date_order_id = delivery_date_order_id

        # Totals snapshot
        self.holiday_fee_percent = Decimal(str(order.holiday_fee))

        # Calculate holiday fee amount with proper quantization to 2 decimal places
        # The order.holiday_fee_amount property may return more than 2 decimal places,
        # so we must quantize it to match the field's decimal_places=2 constraint
        if self.holiday_fee_percent > 0:
            holiday_fee_amount = Decimal(str(order.holiday_fee_amount))
            self.holiday_fee_amount = holiday_fee_amount.quantize(Decimal("0.01"))

        self.delivery_fee_amount = Decimal(str(order.delivery_fee))
        self.discount_amount = Decimal(str(order.discount))
        self.total_amount = Decimal(str(order.total_price))
        # VAT amount will be calculated after line items are built
        self.vat_amount = Decimal("0")

    def build_line_items_from_order(self):
        """
        Create immutable line item snapshots from the order's items.
        After creating all line items, calculate total VAT by summing their vat_amount values.
        """
        if self.pk is None:
            raise ValidationError("Invoice must be saved before building line items.")

        # Prevent rebuilding if line items exist (immutability)
        if self.line_items.exists():
            raise ValidationError(
                "Invoice line items already exist and cannot be rebuilt."
            )

        vat_total = Decimal("0")

        # Create line items
        for item in self.order.items.all():
            description = item.item_name or (
                item.product.name if item.product else "Deleted product"
            )
            unit_gross = (
                item.item_price
                if item.item_price is not None
                else (item.product.price if item.product else Decimal("0"))
            )
            quantity = item.quantity or Decimal("0")
            line_total_gross = Decimal(str(item.get_total_price() or 0))

            # Get VAT rate from product
            vat_rate = Decimal("0")
            if item.product and getattr(item.product, "vat", False):
                vat_rate = Decimal("0.20")

            # Calculate net unit price
            if vat_rate > 0:
                unit_price_net = (unit_gross / (Decimal("1") + vat_rate)).quantize(
                    Decimal("0.01")
                )
            else:
                unit_price_net = unit_gross

            # Calculate VAT amounts
            unit_vat_amount = (unit_gross - unit_price_net).quantize(Decimal("0.01"))
            line_vat_amount = (unit_vat_amount * quantity).quantize(Decimal("0.01"))

            vat_total += line_vat_amount

            InvoiceLineItem.objects.create(
                invoice=self,
                description=description,
                quantity=quantity,
                unit_gross=unit_gross,
                unit_price=unit_price_net,
                line_total=line_total_gross,
                vat_rate=vat_rate,
                vat_amount=line_vat_amount,
            )

        # Calculate total VAT from all line items
        self.vat_amount = vat_total.quantize(Decimal("0.01"))
        self.save(update_fields=["vat_amount"])

    @staticmethod
    def _get_s3_client():
        import boto3

        return boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=getattr(settings, "AWS_S3_REGION_NAME", None),
        )

    def get_presigned_invoice_url(self, expires_in: int = 300) -> str:
        """
        Return a presigned URL for the stored invoice PDF.
        """
        if not self.invoice_link:
            raise ValidationError("Invoice has no stored PDF (invoice_link is empty).")

        s3 = self._get_s3_client()
        return s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                "Key": self.invoice_link,
            },
            ExpiresIn=expires_in,
        )

    def generate_and_upload_pdf(self, request, *, max_retries: int = 3) -> str:
        """
        Render invoice.html, generate a PDF and upload to S3.
        Stores the resulting S3 key on this Invoice as `invoice_link`.
        """
        import gc
        import os
        import tempfile
        import time
        from pathlib import Path

        from weasyprint import HTML
        from weasyprint.text.fonts import FontConfiguration

        if self.invoice_link:
            # immutable once set; don't regenerate
            return self.invoice_link

        # We need an invoice number for stable storage key naming
        if self.invoice_number is None:
            self.allocate_invoice_number_if_needed()
            self.save(update_fields=["invoice_number"])

        # Render invoice HTML using existing template contract
        from django.template.loader import render_to_string

        html_string = render_to_string(
            "invoice.html",
            {
                "invoice": self,
                "business": getattr(settings, "BUSINESS_INFO", {}),
            },
        )

        # Setup font configuration with cache to prevent crashes
        cache_dir = Path("/tmp/weasyprint_cache")
        cache_dir.mkdir(parents=True, exist_ok=True)
        font_config = FontConfiguration()

        # Generate PDF with a persistent temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", mode="wb") as tmp:
            tmp_path = tmp.name

        try:
            # base_url helps WeasyPrint resolve relative URLs
            base_url = request.build_absolute_uri("/")

            # Use font_config and cache to prevent crashes
            try:
                HTML(
                    string=html_string,
                    base_url=base_url,
                ).write_pdf(
                    target=tmp_path,
                    font_config=font_config,
                    optimize_images=True,
                    jpeg_quality=85,
                    dpi=150,
                    cache=cache_dir,
                )
            except Exception as pdf_error:
                # Clean up temp file on PDF generation failure
                try:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)
                except OSError:
                    pass
                raise ValueError(
                    f"PDF generation failed: {str(pdf_error)}"
                ) from pdf_error

            if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
                raise ValueError("PDF generation failed (empty/missing file).")

            # Force garbage collection after PDF generation to free memory
            del html_string, font_config
            gc.collect()

            # Upload with retries
            s3 = self._get_s3_client()
            bucket = settings.AWS_STORAGE_BUCKET_NAME
            s3_key = f"invoices/invoice_{self.invoice_number}.pdf"

            last_exc = None
            for attempt in range(1, max_retries + 1):
                try:
                    s3.upload_file(tmp_path, bucket, s3_key)
                    self.invoice_link = s3_key
                    self.save(update_fields=["invoice_link"])
                    return s3_key
                except Exception as e:
                    last_exc = e
                    if attempt < max_retries:
                        time.sleep(2 ** (attempt - 1))
                    else:
                        raise
            raise last_exc  # pragma: no cover
        finally:
            try:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
            except OSError:
                pass

    @classmethod
    def create_and_publish_from_order(cls, *, order, request):
        """
        Production entrypoint: create invoice from order and publish it in one transaction.
        Always creates a new invoice, even if one already exists for the order.
        - snapshots customer/address/seller + totals
        - creates immutable line items
        - generates/uploads PDF and stores invoice_link
        
        Args:
            order: The order to create an invoice for
            request: Django request object (for PDF generation)
        """
        import logging
        logger = logging.getLogger(__name__)
        
        # Get existing invoice IDs to verify we create a new one
        existing_invoice_ids = set(order.invoices.values_list('id', flat=True))
        logger.info(f"Creating new invoice for order {order.id}. Existing invoice IDs: {existing_invoice_ids}")
        
        # Create new invoice - always create a new one
        # Use transaction.atomic() to ensure all-or-nothing creation
        with transaction.atomic():
            # Populate snapshots BEFORE first save (save() calls full_clean()).
            invoice = cls(order=order)
            invoice.issue_from_order()
            # Allocate invoice number before save() since it's now required
            invoice.allocate_invoice_number_if_needed()
            
            logger.info(f"About to save invoice with number {invoice.invoice_number} for order {order.id}")
            
            # Save the invoice - this will raise an exception if validation fails
            invoice.save()
            
            logger.info(f"Invoice saved with ID {invoice.pk}, invoice_number {invoice.invoice_number}")
            
            # Verify the invoice was actually saved and has a primary key
            if invoice.pk is None:
                raise ValidationError("Invoice was not saved - primary key is None")
            
            # Verify this is a new invoice (not an existing one)
            if invoice.pk in existing_invoice_ids:
                raise ValidationError(
                    f"Invoice with ID {invoice.pk} already existed. This should not happen."
                )
            
            # Build line items after invoice is saved
            try:
                invoice.build_line_items_from_order()
                logger.info(f"Line items built for invoice {invoice.pk}")
            except Exception as e:
                logger.error(f"Error building line items for invoice {invoice.pk}: {e}", exc_info=True)
                raise
            
            # Ensure PDF is uploaded and invoice_link is set
            # Note: PDF generation can fail, but we still want the invoice to exist
            try:
                invoice.generate_and_upload_pdf(request)
                logger.info(f"PDF generated and uploaded for invoice {invoice.pk}")
            except Exception as e:
                logger.warning(f"PDF generation failed for invoice {invoice.pk}, but invoice was created: {e}")
                # Don't raise - invoice is still valid without PDF initially
            
            # Refresh from database to ensure we have the latest state
            invoice.refresh_from_db()
            
            # Final verification that the invoice exists in the database
            if not cls.objects.filter(pk=invoice.pk).exists():
                raise ValidationError(
                    f"Invoice {invoice.pk} was created but does not exist in database after save."
                )
            
            logger.info(f"Successfully created invoice {invoice.pk} (number {invoice.invoice_number}) for order {order.id}")
            return invoice

    def apply_payment(self, amount: Decimal, paid_at: timezone.datetime | None = None):
        """
        Record a payment against this invoice and update status.
        """
        if self.status == self.Status.VOID:
            raise ValidationError("Cannot apply payment to a void invoice.")
        if amount <= 0:
            raise ValidationError("Payment amount must be positive.")

        self.amount_paid = (self.amount_paid or Decimal("0")) + Decimal(str(amount))

        if self.amount_paid >= self.total_amount:
            self.status = self.Status.PAID
            self.paid_at = paid_at or timezone.now()
        else:
            self.status = self.Status.PART_PAID
            if paid_at:
                self.paid_at = paid_at

        self.save(update_fields=["amount_paid", "status", "paid_at"])

    def void(self, reason: str = ""):
        if self.status == self.Status.PAID:
            raise ValidationError("Cannot void a paid invoice.")
        self.status = self.Status.VOID
        self.voided_at = timezone.now()
        self.void_reason = reason or ""
        self.save(update_fields=["status", "voided_at", "void_reason"])

    def save(self, *args, **kwargs):
        # Ensure snapshots are populated BEFORE validation on first save.
        # This keeps the accounting document non-blank while still using full_clean().
        if self.pk is None and self.order_id:
            if (
                not self.customer_snapshot
                or not self.billing_address_snapshot
                or not self.seller_snapshot
            ):
                self.issue_from_order()

        self.full_clean()
        super().save(*args, **kwargs)


class CreditNoteNumberSequence(models.Model):
    """
    Singleton-style row used to allocate sequential credit note numbers safely.
    """

    last_number = models.PositiveBigIntegerField(default=0)

    class Meta:
        verbose_name = "Credit Note Number Sequence"
        verbose_name_plural = "Credit Note Number Sequences"

    def __str__(self) -> str:
        return f"Credit note sequence (last={self.last_number})"


class CreditNote(models.Model):
    """
    A credit note cancels an invoice. It contains the same snapshots
    as the original invoice for immutable accounting records.
    """

    class Status(models.TextChoices):
        ISSUED = "ISSUED", "Issued"
        APPLIED = "APPLIED", "Applied"  # Credit has been used/refunded

    # Link to the original invoice being cancelled
    invoice = models.OneToOneField(
        "billing.Invoice",
        on_delete=models.PROTECT,
        related_name="credit_note",
        help_text="The invoice this credit note cancels.",
    )

    credit_note_number = models.PositiveBigIntegerField(
        unique=True,
        help_text="Sequential credit note number allocated at issuance.",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ISSUED,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    # Reason for issuing the credit note
    reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for issuing this credit note.",
    )

    # Snapshot fields (copied from the original invoice for immutability)
    customer_snapshot = models.JSONField(default=dict)
    billing_address_snapshot = models.JSONField(default=dict)
    seller_snapshot = models.JSONField(default=dict)

    # Delivery date snapshot fields (copied from invoice)
    delivery_date = models.DateField(default=timezone.localdate)
    delivery_date_order_id = models.PositiveIntegerField(default=0)

    # Totals snapshot (same as invoice - represents the credited amounts)
    holiday_fee_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, help_text="Percent (0-100)"
    )
    holiday_fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    delivery_fee_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    vat_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # PDF storage (S3 key) for rendered credit note document
    credit_note_link = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="S3 key/path to the rendered credit note PDF (immutable once set).",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["credit_note_number"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self) -> str:
        num = self.credit_note_number if self.credit_note_number is not None else "—"
        return f"Credit Note #{num} (Invoice #{self.invoice.invoice_number})"

    @property
    def total(self) -> Decimal:
        """Total credit amount (for template compatibility)."""
        return self.total_amount

    @property
    def total_vat(self) -> Decimal:
        """VAT total across line items."""
        return self.vat_amount

    @property
    def subtotal_ex_vat(self) -> Decimal:
        """Subtotal excluding VAT."""
        return self.total_amount - self.vat_amount

    def clean(self):
        # Ensure sane money values
        for field in [
            "holiday_fee_amount",
            "delivery_fee_amount",
            "discount_amount",
            "vat_amount",
            "total_amount",
        ]:
            val = getattr(self, field)
            if val is not None and val < 0:
                raise ValidationError({field: "Must be non-negative."})

        # Immutability check after PDF is generated
        if self.pk:
            prev = CreditNote.objects.get(pk=self.pk)
            if prev.credit_note_link:
                immutable_fields = [
                    "invoice_id",
                    "credit_note_number",
                    "customer_snapshot",
                    "billing_address_snapshot",
                    "seller_snapshot",
                    "holiday_fee_percent",
                    "holiday_fee_amount",
                    "delivery_fee_amount",
                    "discount_amount",
                    "vat_amount",
                    "total_amount",
                    "credit_note_link",
                ]
                for f in immutable_fields:
                    if getattr(prev, f) != getattr(self, f):
                        raise ValidationError(
                            "Credit notes are immutable accounting documents; they cannot be modified after publication."
                        )

    def _allocate_credit_note_number(self) -> int:
        """
        Allocate the next sequential credit note number atomically.
        """
        with transaction.atomic():
            seq, _ = CreditNoteNumberSequence.objects.select_for_update().get_or_create(
                pk=1, defaults={"last_number": 0}
            )
            seq.last_number += 1
            seq.save(update_fields=["last_number"])
            return int(seq.last_number)

    def allocate_credit_note_number_if_needed(self):
        if self.credit_note_number is None:
            self.credit_note_number = self._allocate_credit_note_number()

    def copy_snapshots_from_invoice(self):
        """
        Copy all snapshot fields from the linked invoice.
        This ensures the credit note is a complete accounting record.
        """
        invoice = self.invoice

        # Copy all snapshot fields
        self.customer_snapshot = dict(invoice.customer_snapshot)
        self.billing_address_snapshot = dict(invoice.billing_address_snapshot)
        self.seller_snapshot = dict(invoice.seller_snapshot)

        # Delivery date snapshots
        self.delivery_date = invoice.delivery_date
        self.delivery_date_order_id = invoice.delivery_date_order_id

        # Totals snapshot
        self.holiday_fee_percent = invoice.holiday_fee_percent
        self.holiday_fee_amount = invoice.holiday_fee_amount
        self.delivery_fee_amount = invoice.delivery_fee_amount
        self.discount_amount = invoice.discount_amount
        self.vat_amount = invoice.vat_amount
        self.total_amount = invoice.total_amount

    def build_line_items_from_invoice(self):
        """
        Create line item snapshots by copying from the original invoice's line items.
        """
        if self.pk is None:
            raise ValidationError("Credit note must be saved before building line items.")

        # Prevent rebuilding if line items exist (immutability)
        if self.line_items.exists():
            raise ValidationError(
                "Credit note line items already exist and cannot be rebuilt."
            )

        for item in self.invoice.line_items.all():
            CreditNoteLineItem.objects.create(
                credit_note=self,
                description=item.description,
                quantity=item.quantity,
                unit_gross=item.unit_gross,
                unit_price=item.unit_price,
                line_total=item.line_total,
                vat_rate=item.vat_rate,
                vat_amount=item.vat_amount,
            )

    @staticmethod
    def _get_s3_client():
        import boto3

        return boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=getattr(settings, "AWS_S3_REGION_NAME", None),
        )

    def get_presigned_credit_note_url(self, expires_in: int = 300) -> str:
        """
        Return a presigned URL for the stored credit note PDF.
        """
        if not self.credit_note_link:
            raise ValidationError("Credit note has no stored PDF (credit_note_link is empty).")

        s3 = self._get_s3_client()
        return s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                "Key": self.credit_note_link,
            },
            ExpiresIn=expires_in,
        )

    def generate_and_upload_pdf(self, request, *, max_retries: int = 3) -> str:
        """
        Render credit_note.html, generate a PDF and upload to S3.
        Stores the resulting S3 key on this CreditNote as `credit_note_link`.
        """
        import gc
        import os
        import tempfile
        import time
        from pathlib import Path

        from weasyprint import HTML
        from weasyprint.text.fonts import FontConfiguration

        if self.credit_note_link:
            # immutable once set; don't regenerate
            return self.credit_note_link

        # We need a credit note number for stable storage key naming
        if self.credit_note_number is None:
            self.allocate_credit_note_number_if_needed()
            self.save(update_fields=["credit_note_number"])

        # Render credit note HTML using template
        from django.template.loader import render_to_string

        html_string = render_to_string(
            "credit_note.html",
            {
                "credit_note": self,
                "business": getattr(settings, "BUSINESS_INFO", {}),
            },
        )

        # Setup font configuration with cache to prevent crashes
        cache_dir = Path("/tmp/weasyprint_cache")
        cache_dir.mkdir(parents=True, exist_ok=True)
        font_config = FontConfiguration()

        # Generate PDF with a persistent temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", mode="wb") as tmp:
            tmp_path = tmp.name

        try:
            # base_url helps WeasyPrint resolve relative URLs
            base_url = request.build_absolute_uri("/")

            # Use font_config and cache to prevent crashes
            try:
                HTML(
                    string=html_string,
                    base_url=base_url,
                ).write_pdf(
                    target=tmp_path,
                    font_config=font_config,
                    optimize_images=True,
                    jpeg_quality=85,
                    dpi=150,
                    cache=cache_dir,
                )
            except Exception as pdf_error:
                # Clean up temp file on PDF generation failure
                try:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)
                except OSError:
                    pass
                raise ValueError(
                    f"PDF generation failed: {str(pdf_error)}"
                ) from pdf_error

            if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
                raise ValueError("PDF generation failed (empty/missing file).")

            # Force garbage collection after PDF generation to free memory
            del html_string, font_config
            gc.collect()

            # Upload with retries
            s3 = self._get_s3_client()
            bucket = settings.AWS_STORAGE_BUCKET_NAME
            s3_key = f"credit_notes/credit_note_{self.credit_note_number}.pdf"

            last_exc = None
            for attempt in range(1, max_retries + 1):
                try:
                    s3.upload_file(tmp_path, bucket, s3_key)
                    self.credit_note_link = s3_key
                    self.save(update_fields=["credit_note_link"])
                    return s3_key
                except Exception as e:
                    last_exc = e
                    if attempt < max_retries:
                        time.sleep(2 ** (attempt - 1))
                    else:
                        raise
            raise last_exc  # pragma: no cover
        finally:
            try:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
            except OSError:
                pass

    @classmethod
    def create_and_publish_from_invoice(cls, *, invoice, reason: str = "", request):
        """
        Production entrypoint: create credit note from invoice and publish it in one transaction.
        - copies all snapshots from the invoice
        - creates immutable line items
        - generates/uploads PDF and stores credit_note_link
        - voids the original invoice
        Idempotent: if credit note exists, it ensures PDF exists.
        """
        # Check if invoice already has a credit note
        try:
            existing = invoice.credit_note
            if existing:
                # Ensure PDF is uploaded and credit_note_link is set
                existing.generate_and_upload_pdf(request)
                return existing
        except cls.DoesNotExist:
            pass

        with transaction.atomic():
            credit_note = cls(invoice=invoice, reason=reason)
            credit_note.copy_snapshots_from_invoice()
            credit_note.allocate_credit_note_number_if_needed()
            credit_note.save()
            credit_note.build_line_items_from_invoice()

            # Set the original invoice status to VOID (credit notes can cancel any invoice, including paid ones)
            if invoice.status != Invoice.Status.VOID:
                invoice.status = Invoice.Status.VOID
                invoice.voided_at = timezone.now()
                invoice.void_reason = f"Cancelled by Credit Note #{credit_note.credit_note_number}"
                invoice.save(update_fields=["status", "voided_at", "void_reason"])

            # Generate and upload PDF
            credit_note.generate_and_upload_pdf(request)

            return credit_note

    def save(self, *args, **kwargs):
        # Copy snapshots on first save if not already populated
        if self.pk is None and self.invoice_id:
            if (
                not self.customer_snapshot
                or not self.billing_address_snapshot
                or not self.seller_snapshot
            ):
                self.copy_snapshots_from_invoice()

        self.full_clean()
        super().save(*args, **kwargs)


class CreditNoteLineItem(models.Model):
    """
    Line item for a credit note, mirroring the original invoice line item.
    """

    credit_note = models.ForeignKey(
        CreditNote, related_name="line_items", on_delete=models.CASCADE
    )

    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_gross = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Unit price including VAT (gross).",
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Unit price excluding VAT (net).",
    )
    line_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=0,
        help_text="VAT rate as a decimal (e.g. 0.20).",
    )
    vat_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.description} ({self.quantity} × {self.unit_price})"

    @property
    def unit_vat_amount(self) -> Decimal:
        """VAT amount per unit: unit_gross - unit_price (gross - net)."""
        return (self.unit_gross - self.unit_price).quantize(Decimal("0.01"))

    def get_vat_display(self) -> str:
        """Display VAT rate as percentage (e.g., '20%' instead of 0.20)."""
        vat_percent = self.vat_rate * Decimal("100")
        return f"{vat_percent:.0f}%"

    def clean(self):
        if self.pk:
            prev = CreditNoteLineItem.objects.get(pk=self.pk)
            if (
                prev.description != self.description
                or prev.quantity != self.quantity
                or prev.unit_gross != self.unit_gross
                or prev.unit_price != self.unit_price
                or prev.line_total != self.line_total
                or prev.vat_rate != self.vat_rate
                or prev.vat_amount != self.vat_amount
                or prev.credit_note_id != self.credit_note_id
            ):
                raise ValidationError(
                    "Credit note line items are immutable and cannot be modified after creation."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class InvoiceLineItem(models.Model):
    invoice = models.ForeignKey(
        Invoice, related_name="line_items", on_delete=models.CASCADE
    )

    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_gross = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Unit price including VAT (gross).",
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Unit price excluding VAT (net).",
    )
    line_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=0,
        help_text="VAT rate as a decimal (e.g. 0.20).",
    )
    vat_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.description} ({self.quantity} × {self.unit_price})"

    @property
    def unit_vat_amount(self) -> Decimal:
        """VAT amount per unit: unit_gross - unit_price (gross - net)."""
        return (self.unit_gross - self.unit_price).quantize(Decimal("0.01"))

    def get_vat_display(self) -> str:
        """Display VAT rate as percentage (e.g., '20%' instead of 0.20)."""
        vat_percent = self.vat_rate * Decimal("100")
        return f"{vat_percent:.0f}%"

    def clean(self):
        if self.pk:
            prev = InvoiceLineItem.objects.get(pk=self.pk)
            if (
                prev.description != self.description
                or prev.quantity != self.quantity
                or prev.unit_gross != self.unit_gross
                or prev.unit_price != self.unit_price
                or prev.line_total != self.line_total
                or prev.vat_rate != self.vat_rate
                or prev.vat_amount != self.vat_amount
                or prev.invoice_id != self.invoice_id
            ):
                raise ValidationError(
                    "Invoice line items are immutable and cannot be modified after creation."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
