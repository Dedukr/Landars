from rest_framework.permissions import BasePermission


class IsFestivalStaff(BasePermission):
    """Authenticated staff with festival place-order permission (or superuser)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated or not user.is_staff:
            return False
        return user.is_superuser or user.has_perm("festival.place_festival_order")
