from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import gettext_lazy as _

from .forms import CustomUserCreationForm, CustomUserForm
from .models import Address, CustomUser, Profile


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    form = CustomUserForm
    add_form = CustomUserCreationForm
    list_display = ("profile__name", "email", "is_staff", "is_active")
    list_filter = (
        "is_staff",
        "is_active",
    )
    ordering = ("profile__name",)
    search_fields = ("profile__name", "email")

    fieldsets = [
        (None, {"fields": ("email", "password")}),
        ("Important dates", {"fields": ("last_login",)}),
    ]
    add_fieldsets = [
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "password1",
                    "password2",
                    "name",
                    "phone",
                    "address_line",
                    "address_line2",
                    "city",
                    "postal_code",
                    "notes",
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
                            "name",
                            "phone",
                            "address_line",
                            "address_line2",
                            "city",
                            "postal_code",
                            "notes",
                        )
                    },
                ),
            ]
        if request.user.is_superuser:
            fieldsets = fieldsets + [
                (
                    _("Permissions"),
                    {
                        "fields": (
                            "is_active",
                            "is_staff",
                            "is_superuser",
                            "groups",
                        )
                    },
                ),
            ]
        return fieldsets
