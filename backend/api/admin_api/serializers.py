from rest_framework import serializers


class DashboardSummarySerializer(serializers.Serializer):
    total_orders = serializers.IntegerField()
    pending_orders = serializers.IntegerField()
    completed_orders = serializers.IntegerField()
    total_products = serializers.IntegerField()
    active_products = serializers.IntegerField()
    total_customers = serializers.IntegerField()
    total_shipments = serializers.IntegerField()
    unreconciled_bank_transactions = serializers.IntegerField()


class DashboardKpiSerializer(serializers.Serializer):
    revenue = serializers.CharField()
    orders_count = serializers.IntegerField()
    paid_orders_count = serializers.IntegerField()
    new_customers = serializers.IntegerField()
    average_order_value = serializers.CharField()
    pending_orders = serializers.IntegerField()
    completed_orders = serializers.IntegerField()
    total_products = serializers.IntegerField()
    active_products = serializers.IntegerField()
    total_customers = serializers.IntegerField()


class DashboardChartPointSerializer(serializers.Serializer):
    date = serializers.CharField(allow_null=True)
    value = serializers.JSONField()


class DashboardRecentOrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    reference = serializers.CharField()
    customer_name = serializers.CharField()
    status = serializers.CharField()
    payment_status = serializers.CharField()
    source = serializers.CharField()
    total = serializers.CharField()
    created_at = serializers.CharField(allow_null=True)
    delivery_date = serializers.CharField(allow_null=True)


class DashboardBreakdownItemSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    status = serializers.CharField(required=False)
    source = serializers.CharField(required=False)


class DashboardTopProductSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(allow_null=True)
    name = serializers.CharField()
    quantity_sold = serializers.CharField()
    revenue = serializers.CharField()


class DashboardAlertSerializer(serializers.Serializer):
    type = serializers.CharField()
    severity = serializers.CharField()
    count = serializers.IntegerField()
    message = serializers.CharField()


class AdminDashboardSerializer(serializers.Serializer):
    period = serializers.CharField()
    period_start = serializers.DateTimeField()
    period_end = serializers.DateTimeField()
    kpis = DashboardKpiSerializer()
    charts = serializers.DictField(child=serializers.ListField(child=DashboardChartPointSerializer()))
    recent_orders = DashboardRecentOrderSerializer(many=True)
    breakdowns = serializers.DictField()
    top_products = DashboardTopProductSerializer(many=True)
    alerts = DashboardAlertSerializer(many=True)
    summary = DashboardSummarySerializer()
