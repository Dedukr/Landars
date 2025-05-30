# Generated by Django 5.2 on 2025-05-03 21:39

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_alter_order_options"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="order",
            options={
                "ordering": ["-delivery_date"],
                "permissions": [
                    ("can_change_status_and_note", "Can change order status and notes")
                ],
                "verbose_name_plural": "Orders",
            },
        ),
    ]
