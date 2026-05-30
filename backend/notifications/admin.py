from django.contrib import admin

from notifications.models import NotificationLog


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "order",
        "channel",
        "event",
        "status",
        "created_at",
    )
    list_filter = ("channel", "event", "status")
    search_fields = ("order__id", "provider_message_id")
    readonly_fields = (
        "order",
        "channel",
        "event",
        "recipient",
        "status",
        "provider_message_id",
        "error_message",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser
