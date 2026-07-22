from __future__ import annotations

from rest_framework import serializers

from festival.models import FestivalAddition, FestivalFilling, FestivalProduct
from festival.services.orders import order_print_status


class FestivalAdditionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FestivalAddition
        fields = ["id", "name", "price"]


class FestivalFillingSerializer(serializers.ModelSerializer):
    class Meta:
        model = FestivalFilling
        fields = ["id", "name"]


class FestivalProductSerializer(serializers.ModelSerializer):
    image = serializers.CharField(source="image_url", read_only=True)
    category = serializers.SerializerMethodField()
    addition_class = serializers.SerializerMethodField()
    additions = serializers.SerializerMethodField()
    fillings = serializers.SerializerMethodField()

    class Meta:
        model = FestivalProduct
        fields = [
            "id",
            "name",
            "category_id",
            "category",
            "addition_class_id",
            "addition_class",
            "additions",
            "fillings",
            "image",
            "price",
            "vat_rate",
        ]

    def get_category(self, obj: FestivalProduct) -> str | None:
        return obj.category.name if obj.category_id else None

    def get_addition_class(self, obj: FestivalProduct) -> str | None:
        return obj.addition_class.name if obj.addition_class_id else None

    def get_additions(self, obj: FestivalProduct) -> list[dict]:
        if not obj.addition_class_id:
            return []
        additions = obj.addition_class.additions.all()
        return FestivalAdditionSerializer(additions, many=True).data

    def get_fillings(self, obj: FestivalProduct) -> list[dict]:
        fillings = [f for f in obj.fillings.all() if f.is_active]
        return FestivalFillingSerializer(fillings, many=True).data


class FestivalOrderItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)
    filling_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    addition_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)


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
        "created_at": order.created_at.isoformat().replace("+00:00", "Z"),
        "invoice_number": invoice_number,
        "print_status": order_print_status(order),
        "replayed": replayed,
        "status": order.status,
    }
