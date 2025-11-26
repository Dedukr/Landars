# Generated manually on 2025-11-26

from decimal import Decimal
from django.core.validators import MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_add_order_delivery_date_order_id"),
    ]

    operations = [
        migrations.RenameField(
            model_name="product",
            old_name="price",
            new_name="base_price",
        ),
        migrations.AddField(
            model_name="product",
            name="holiday_fee",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("0"),
                help_text="Additional holiday fee applied to the product",
                max_digits=10,
                validators=[MinValueValidator(0)],
            ),
        ),
        migrations.AlterField(
            model_name="product",
            name="base_price",
            field=models.DecimalField(
                decimal_places=2,
                help_text="Base price of the product",
                max_digits=10,
                validators=[MinValueValidator(0)],
            ),
        ),
    ]
