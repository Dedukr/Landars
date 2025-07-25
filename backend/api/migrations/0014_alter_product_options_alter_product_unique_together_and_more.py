# Generated by Django 5.2 on 2025-05-25 13:18

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0013_alter_order_is_home_delivery'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='product',
            options={'ordering': ['name'], 'verbose_name_plural': 'Products'},
        ),
        migrations.AlterUniqueTogether(
            name='product',
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name='product',
            name='category',
        ),
        migrations.AddField(
            model_name='product',
            name='category',
            field=models.ManyToManyField(related_name='products', to='api.productcategory'),
        ),
    ]
