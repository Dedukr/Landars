# Generated by Django 5.2 on 2025-06-02 17:37

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0016_remove_productcategory_parent'),
    ]

    operations = [
        migrations.AddField(
            model_name='productcategory',
            name='parent',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='subcategories', to='api.productcategory'),
        ),
    ]
