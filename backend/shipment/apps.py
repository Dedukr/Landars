from django.apps import AppConfig


class ShipmentConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "shipment"
    verbose_name = "Shipment (Sendcloud post)"

    def ready(self) -> None:
        import shipment.signals  # noqa: F401
