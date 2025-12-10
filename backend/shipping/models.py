from django.db import models


class ShippingDetails(models.Model):
    """
    Stores shipment data for an order (Sendcloud fields).

    Moved from the Order model to keep shipping concerns isolated.
    """

    order = models.OneToOneField(
        "api.Order",
        on_delete=models.CASCADE,
        related_name="shipping_details",
    )
    shipping_method_id = models.IntegerField(
        blank=True, null=True, help_text="Sendcloud shipping method ID"
    )
    shipping_carrier = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Shipping carrier name (e.g., DPD, Royal Mail)",
    )
    shipping_service_name = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Shipping service name (e.g., Standard, Express)",
    )
    shipping_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True,
        help_text="Cost of shipping charged to customer",
    )
    shipping_tracking_number = models.CharField(
        max_length=255, blank=True, null=True, help_text="Shipment tracking number"
    )
    shipping_tracking_url = models.URLField(
        max_length=500, blank=True, null=True, help_text="Shipment tracking URL"
    )
    shipping_label_url = models.URLField(
        max_length=500, blank=True, null=True, help_text="Shipping label URL"
    )
    sendcloud_parcel_id = models.IntegerField(
        blank=True, null=True, help_text="Sendcloud parcel ID for tracking"
    )
    shipping_status = models.CharField(
        max_length=50,
        choices=[
            ("pending_shipment", "Pending Shipment"),
            ("label_created", "Label Created"),
            ("shipment_failed", "Shipment Failed"),
            ("in_transit", "In Transit"),
            ("out_for_delivery", "Out for Delivery"),
            ("delivered", "Delivered"),
        ],
        blank=True,
        null=True,
        help_text="Current shipping status",
    )
    shipping_error_message = models.TextField(
        blank=True, null=True, help_text="Error message if shipment creation failed"
    )

    def __str__(self) -> str:
        return f"Shipping for Order {self.order_id}"
