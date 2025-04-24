from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import gettext_lazy as _

from .forms import CustomUserCreationForm, CustomUserForm
from .models import Address, CustomUser, Profile


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    form = CustomUserForm
    add_form = CustomUserCreationForm
    list_display = ("name", "profile__phone", "is_staff", "is_active")
    list_filter = (
        "is_staff",
        "is_active",
    )
    ordering = ("name",)
    search_fields = ("name", "profile__phone", "email")

    fieldsets = [
        (None, {"fields": ("name", "email", "password")}),
    ]
    add_fieldsets = [
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "name",
                    "phone",
                    "address_line",
                    "address_line2",
                    "city",
                    "postal_code",
                    "notes",
                    "email",
                    "password",
                ),
            },
        ),
    ]

    def get_fieldsets(self, request, obj=None):
        """
        Dynamically change the fieldsets for users in the 'root' group only
        """
        fieldsets = super().get_fieldsets(request, obj)

        if obj and not obj.is_staff:
            fieldsets = fieldsets + [
                (
                    _("Profile"),
                    {
                        "fields": (
                            # "name",
                            "phone",
                            "address_line",
                            "address_line2",
                            "city",
                            "postal_code",
                            "notes",
                        )
                    },
                ),
                ("Important fields", {"fields": ("last_login", "is_active")}),
            ]
        if request.user.is_superuser:
            fieldsets = fieldsets + [
                (
                    _("Permissions"),
                    {
                        "fields": (
                            "is_staff",
                            "is_superuser",
                            "groups",
                        )
                    },
                ),
            ]
        return fieldsets
