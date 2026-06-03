"""
Serializers for the admin dashboard API (section 17 — exact response shape).

These are documentation-level serializers; the views return plain dicts via
``Response(data)`` so DRF does not enforce these at runtime. They exist to
make the contract explicit and to support future DRF schema generation.

Guaranteed empty-safe: every list/string/int field has a safe default so the
frontend never receives null for a missing section.
"""

from rest_framework import serializers


# ---------------------------------------------------------------------------
# KPIs (section 6)
# ---------------------------------------------------------------------------

class DashboardKpiSerializer(serializers.Serializer):
    # Today
    today_revenue = serializers.CharField(default="0.00")
    today_orders = serializers.IntegerField(default=0)
    # Period
    revenue = serializers.CharField(default="0.00")
    orders_count = serializers.IntegerField(default=0)
    paid_orders = serializers.IntegerField(default=0)
    average_order_value = serializers.CharField(default="0.00")
    pending_orders = serializers.IntegerField(default=0)
    completed_orders = serializers.IntegerField(default=0)
    new_customers = serializers.IntegerField(default=0)
    # Operations
    unmatched_transactions = serializers.IntegerField(default=0)
    failed_shipments = serializers.IntegerField(default=0)
    failed_notifications = serializers.IntegerField(default=0)
    invoices_issued_this_month = serializers.IntegerField(default=0)
    credit_notes_this_month = serializers.IntegerField(default=0)
    # Product
    top_product_sold_quantity = serializers.IntegerField(default=0)
    # Catalogue (extra — not in spec minimum but returned)
    total_products = serializers.IntegerField(default=0)
    active_products = serializers.IntegerField(default=0)
    total_customers = serializers.IntegerField(default=0)


# ---------------------------------------------------------------------------
# Sales chart (section 7)
# ---------------------------------------------------------------------------

class SalesChartEntrySerializer(serializers.Serializer):
    date = serializers.CharField()
    revenue = serializers.CharField(default="0.00")
    orders = serializers.IntegerField(default=0)


# ---------------------------------------------------------------------------
# Breakdowns (sections 8–11)
# ---------------------------------------------------------------------------

class StatusCountSerializer(serializers.Serializer):
    """Generic {status, count} row used by all breakdown lists."""
    status = serializers.CharField()
    count = serializers.IntegerField(default=0)


class SourceCountSerializer(serializers.Serializer):
    source = serializers.CharField()
    count = serializers.IntegerField(default=0)


# ---------------------------------------------------------------------------
# Top products (section 12)
# ---------------------------------------------------------------------------

class TopProductSerializer(serializers.Serializer):
    id = serializers.IntegerField(allow_null=True)
    name = serializers.CharField()
    sold_quantity = serializers.CharField(default="0.00")
    sold_orders_count = serializers.IntegerField(default=0)
    revenue = serializers.CharField(default="0.00")


# ---------------------------------------------------------------------------
# Recent orders (section 13)
# ---------------------------------------------------------------------------

class RecentOrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    reference = serializers.CharField()
    customer_name = serializers.CharField()
    status = serializers.CharField()
    payment_status = serializers.CharField(allow_blank=True)
    source = serializers.CharField(allow_blank=True)
    total = serializers.CharField(default="0.00")
    created_at = serializers.CharField(allow_null=True)
    delivery_date = serializers.CharField(allow_null=True)


# ---------------------------------------------------------------------------
# Alert records (section 14)
# ---------------------------------------------------------------------------

class FailedShipmentAlertSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    order_id = serializers.IntegerField(allow_null=True)
    status = serializers.CharField()
    message = serializers.CharField(allow_blank=True)
    created_at = serializers.CharField(allow_null=True)


class UnmatchedTransactionAlertSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    amount = serializers.CharField(default="0.00")
    reference = serializers.CharField(allow_blank=True)
    statement_date = serializers.CharField(allow_blank=True)
    created_at = serializers.CharField(allow_null=True)


class FailedNotificationAlertSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    order_id = serializers.IntegerField(allow_null=True)
    event = serializers.CharField()
    error = serializers.CharField(allow_blank=True)
    created_at = serializers.CharField(allow_null=True)


class AlertRecordsSerializer(serializers.Serializer):
    failed_shipments = FailedShipmentAlertSerializer(many=True, default=list)
    unmatched_transactions = UnmatchedTransactionAlertSerializer(many=True, default=list)
    failed_notifications = FailedNotificationAlertSerializer(many=True, default=list)


# ---------------------------------------------------------------------------
# Legacy summary (GET /api/dashboard/summary/)
# ---------------------------------------------------------------------------

class DashboardSummarySerializer(serializers.Serializer):
    total_orders = serializers.IntegerField(default=0)
    pending_orders = serializers.IntegerField(default=0)
    completed_orders = serializers.IntegerField(default=0)
    total_products = serializers.IntegerField(default=0)
    active_products = serializers.IntegerField(default=0)
    total_customers = serializers.IntegerField(default=0)
    total_shipments = serializers.IntegerField(default=0)
    unreconciled_bank_transactions = serializers.IntegerField(default=0)


# ---------------------------------------------------------------------------
# Full dashboard response (section 17 — exact shape)
# ---------------------------------------------------------------------------

class AdminDashboardSerializer(serializers.Serializer):
    """
    Canonical response shape for GET /api/admin/dashboard/.

    Every field has a safe default so the frontend never receives null for a
    missing section (section 17 requirement).
    """
    # Period metadata
    period = serializers.CharField()
    period_start = serializers.CharField()
    period_end = serializers.CharField()
    # KPI cards
    kpis = DashboardKpiSerializer()
    # Sales chart — flat top-level key (section 17)
    sales_chart = SalesChartEntrySerializer(many=True, default=list)
    # Breakdown lists — flat top-level keys (section 17)
    order_status_breakdown = StatusCountSerializer(many=True, default=list)
    orders_by_source = SourceCountSerializer(many=True, default=list)
    invoice_status_breakdown = StatusCountSerializer(many=True, default=list)
    shipment_status_breakdown = StatusCountSerializer(many=True, default=list)
    reconciliation_breakdown = StatusCountSerializer(many=True, default=list)
    # Other sections
    top_products = TopProductSerializer(many=True, default=list)
    recent_orders = RecentOrderSerializer(many=True, default=list)
    alerts = AlertRecordsSerializer()
    summary = DashboardSummarySerializer()
