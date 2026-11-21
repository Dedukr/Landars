"""Seed the two holiday events (switched off) so admins only need to tick Active."""

from decimal import Decimal

from django.db import migrations

SEED = [
    {
        "name": "Christmas",
        "theme": "christmas",
        "delivery_window_label": "Delivered 22–24 December",
    },
    {
        "name": "New Year",
        "theme": "new_year",
        "delivery_window_label": "Delivered 29–31 December",
    },
]


def seed(apps, schema_editor):
    HolidayEvent = apps.get_model("api", "HolidayEvent")
    for row in SEED:
        if not HolidayEvent.objects.filter(theme=row["theme"]).exists():
            HolidayEvent.objects.create(
                surcharge_percent=Decimal("15"), active=False, **row
            )


def unseed(apps, schema_editor):
    HolidayEvent = apps.get_model("api", "HolidayEvent")
    HolidayEvent.objects.filter(
        theme__in=[row["theme"] for row in SEED], orders__isnull=True
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0061_holidayevent_cart_order_holiday_event"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
