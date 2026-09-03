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

    Website self-registrations skip fuzzy name matching to avoid deleting
    new customer accounts during signup bursts.
    """
    if not created:
        return

    if getattr(instance, "created_source", None) == CustomUser.CREATED_SOURCE_WEBSITE:
        logger.debug(
            "Skipping auto-merge for website signup user pk=%s email=%s",
            instance.pk,
            instance.email,
        )
        return

    from .merge_service import merge_users

    try:
        merge_users(instance)
    except Exception:
        logger.exception(
            "Merge: unexpected error during merge for new user '%s' (pk=%s)",
            instance.name,
            instance.pk,
        )
