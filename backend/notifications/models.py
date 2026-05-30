from django.db import models


class NotificationLog(models.Model):
    class Channel(models.TextChoices):
        TELEGRAM = "telegram", "Telegram"

    class Event(models.TextChoices):
        NEW_FRONTEND_ORDER = "new_frontend_order", "New frontend order"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    channel = models.CharField(max_length=30, choices=Channel.choices)
    event = models.CharField(max_length=100, choices=Event.choices)
    order = models.ForeignKey(
        "api.Order",
        on_delete=models.CASCADE,
        related_name="notification_logs",
    )
    recipient = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.PENDING,
    )
    provider_message_id = models.CharField(max_length=255, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["order", "channel", "event"],
                name="notifications_unique_order_channel_event",
            ),
        ]
        indexes = [
            models.Index(fields=["channel", "event", "status"]),
        ]

    def __str__(self):
        return f"{self.channel}/{self.event} order={self.order_id} ({self.status})"
