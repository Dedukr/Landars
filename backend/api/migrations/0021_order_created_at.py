# Generated manually to add created_at field

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0019_order_delivery_fee_manual"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                default=django.utils.timezone.now,
                help_text="Exact timestamp when order was created",
            ),
            preserve_default=False,
        ),
    ]
