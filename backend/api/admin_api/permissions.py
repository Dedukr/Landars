from rest_framework.permissions import BasePermission


class IsAdminStaffUser(BasePermission):
    """
    Allows access only to authenticated staff users.
    Used for all custom admin dashboard API endpoints.
    """

    message = "You do not have permission to access the admin dashboard."

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.is_staff
        )


class IsSuperUser(BasePermission):
    """
    Allows access only to superusers.
    Used for dangerous admin operations.
    """

    message = "This action requires superuser permissions."

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.is_superuser
        )
