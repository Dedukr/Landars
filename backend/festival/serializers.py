from __future__ import annotations

from rest_framework import serializers

from festival.models import FestivalProduct
from festival.services.orders import order_print_status


class FestivalProductSerializer(serializers.ModelSerializer):
    image = serializers.CharField(source="image_url", read_only=True)

    class Meta:
        model = FestivalProduct
        fields = ["id", "name", "image", "price", "vat_rate"]


class FestivalOrderItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)


class FestivalOrderCreateSerializer(serializers.Serializer):
    client_request_id = serializers.UUIDField()
    items = FestivalOrderItemInputSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value


def serialize_order_response(order, *, replayed: bool = False) -> dict:
    invoice_number = ""
    if hasattr(order, "invoice") and order.invoice:
        invoice_number = order.invoice.invoice_number
    return {
        "id": order.pk,
        "order_number": str(order.order_number),
        "total_price": f"{order.total_price:.2f}",
        "paid_at": order.paid_at.isoformat().replace("+00:00", "Z"),
        "invoice_number": invoice_number,
        "print_status": order_print_status(order),
        "replayed": replayed,
        "status": order.status,
    }
