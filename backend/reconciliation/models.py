from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone
from api.models import Order
from account.models import CustomUser


class StatementBatch(models.Model):
    """Represents a batch of transactions imported from a single PDF statement."""
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        related_name="statement_batches"
    )
    filename = models.CharField(max_length=255)
    file_hash = models.CharField(
        max_length=64,
        help_text="SHA-256 hash of the PDF file for deduplication"
    )
    notes = models.TextField(blank=True, null=True)
    
    class Meta:
        verbose_name_plural = "Statement Batches"
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["file_hash"]),
        ]
    
    def __str__(self):
        return f"Batch {self.id} - {self.filename} ({self.uploaded_at.date()})"


class BankTransaction(models.Model):
    """Represents a single transaction extracted from a bank statement."""
    
    class MatchStatus(models.TextChoices):
        MATCHED = "matched", "Matched"
        SUGGESTED = "suggested", "Suggested"
        UNMATCHED = "unmatched", "Unmatched"
        REJECTED = "rejected", "Rejected"
    
    batch = models.ForeignKey(
        StatementBatch,
        on_delete=models.CASCADE,
        related_name="transactions"
    )
    
    # Parsed fields
    statement_date = models.CharField(
        max_length=50,
        help_text="Date as it appears in statement (e.g., '01 May')"
    )
    statement_date_parsed = models.DateField(
        null=True,
        blank=True,
        help_text="Parsed date (year inferred from batch upload date)"
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Transaction amount in GBP"
    )
    payer_name = models.CharField(
        max_length=255,
        help_text="Name of the payer from statement"
    )
    raw_line = models.TextField(
        help_text="Full original line text from PDF"
    )
    
    # Matching fields
    match_status = models.CharField(
        max_length=20,
        choices=MatchStatus.choices,
        default=MatchStatus.UNMATCHED
    )
    matched_order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bank_transactions"
    )
    confidence_score = models.IntegerField(
        default=0,
        help_text="Confidence score 0-100"
    )
    matching_reason = models.TextField(
        blank=True,
        help_text="Explanation of why this match was suggested/confirmed"
    )
    
    # Audit fields
    matched_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="matched_transactions"
    )
    matched_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = "Bank Transactions"
        ordering = ["-statement_date_parsed", "-created_at"]
        indexes = [
            models.Index(fields=["match_status"]),
            models.Index(fields=["amount"]),
            models.Index(fields=["statement_date_parsed"]),
            models.Index(fields=["payer_name"]),
        ]
    
    def __str__(self):
        return f"{self.statement_date} - {self.payer_name} - £{self.amount}"
    
    def mark_as_matched(self, order, user, reason="", confidence_score=None):
        """Mark transaction as matched to an order."""
        self.match_status = self.MatchStatus.MATCHED
        self.matched_order = order
        self.matched_by = user
        self.matched_at = timezone.now()
        self.matching_reason = reason
        if confidence_score is not None:
            self.confidence_score = confidence_score
        self.save()
        
        # Update order status to paid if not already
        if order and order.status != "paid":
            order.status = "paid"
            order.save(update_fields=["status"])
    
    def mark_as_rejected(self):
        """Mark transaction as rejected (don't suggest again)."""
        self.match_status = self.MatchStatus.REJECTED
        self.rejected_at = timezone.now()
        self.save()


class ReconciliationMatch(models.Model):
    """Stores match suggestions and history for transactions."""
    transaction = models.ForeignKey(
        BankTransaction,
        on_delete=models.CASCADE,
        related_name="match_suggestions"
    )
    suggested_order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="reconciliation_matches"
    )
    confidence_score = models.IntegerField(
        help_text="Confidence score 0-100"
    )
    matching_reason = models.TextField(
        help_text="Why this order was suggested"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name_plural = "Reconciliation Matches"
        ordering = ["-confidence_score", "-created_at"]
        indexes = [
            models.Index(fields=["transaction", "confidence_score"]),
        ]
    
    def __str__(self):
        return f"Match: {self.transaction} -> Order #{self.suggested_order.id} ({self.confidence_score}%)"
