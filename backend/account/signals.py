"""
Account signals.

Registers a post_save handler on CustomUser that triggers the automatic
user-merge logic whenever a new user is created.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import CustomUser

logger = logging.getLogger(__name__)


@receiver(post_save, sender=CustomUser)
def trigger_user_merge_on_create(sender, instance, created, **kwargs):
    """
    After a new CustomUser is created, check for similar existing users and
    merge them if the rules allow it.

    The handler only runs when ``created=True`` to avoid infinite recursion:
    the merge service uses queryset ``.update()`` calls (not model ``.save()``)
    for the CustomUser table, so no further post_save signals are emitted for
    CustomUser rows touched during the merge.
    """
    if not created:
        return

    # Lazy import to avoid circular import at module load time.
    from .merge_service import merge_users

    try:
        merge_users(instance)
    except Exception:
        logger.exception(
            "Merge: unexpected error during merge for new user '%s' (pk=%s)",
            instance.name,
            instance.pk,
        )
