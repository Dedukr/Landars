# api/signals.py
from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from .models import Product, ProductCategory


@receiver(m2m_changed, sender=Product.categories.through)
def add_parent_categories(sender, instance, action, reverse, pk_set, **kwargs):
    if action == "post_add":
        new_parents = set()

        for category_id in pk_set:
            cat = ProductCategory.objects.get(id=category_id)
            parent = cat.parent
            while parent:
                new_parents.add(parent.id)
                parent = parent.parent

        if new_parents:
            instance.categories.add(*new_parents)
