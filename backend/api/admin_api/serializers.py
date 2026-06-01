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
