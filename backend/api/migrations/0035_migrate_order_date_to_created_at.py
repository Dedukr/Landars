# Generated migration to transfer order_date values to created_at and remove order_date field

from django.db import migrations
from django.utils import timezone
from datetime import datetime, time as dt_time


def migrate_order_date_to_created_at(apps, schema_editor):
    """
    Transfer order_date values to created_at.
    For orders where order_date exists but created_at might be different,
    we'll use order_date with the time from created_at, or midnight if created_at is None.
    """
    Order = apps.get_model('api', 'Order')
    
    for order in Order.objects.all():
        # If order has order_date but created_at is None or different date
        if hasattr(order, 'order_date') and order.order_date:
            # If created_at exists, keep its time but use order_date's date
            if order.created_at:
                # Combine order_date (date) with created_at (time)
                new_datetime = datetime.combine(
                    order.order_date,
                    order.created_at.time()
                )
                # Make timezone-aware if created_at was timezone-aware
                if timezone.is_aware(order.created_at):
                    new_datetime = timezone.make_aware(new_datetime)
                order.created_at = new_datetime
            else:
                # If no created_at, use order_date at midnight
                new_datetime = datetime.combine(order.order_date, dt_time.min)
                # Make timezone-aware
                new_datetime = timezone.make_aware(new_datetime)
                order.created_at = new_datetime
            
            # Save without triggering signals
            Order.objects.filter(pk=order.pk).update(created_at=order.created_at)


def reverse_migration(apps, schema_editor):
    """
    Reverse migration: This would be complex since we can't restore order_date
    from created_at without losing information. We'll just pass.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0034_remove_order_sendcloud_parcel_id_and_more'),
    ]

    operations = [
        # First, migrate the data
        migrations.RunPython(
            migrate_order_date_to_created_at,
            reverse_migration,
        ),
        # Then, remove the order_date field
        migrations.RemoveField(
            model_name='order',
            name='order_date',
        ),
    ]

