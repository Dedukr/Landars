from django.apps import AppConfig


class ShippingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "shipping"
    verbose_name = "Shipping (Sendcloud / parcels)"

    def ready(self) -> None:
        import shipping.signals  # noqa: F401
