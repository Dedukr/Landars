from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import gettext_lazy as _

from .forms import CustomUserCreationForm, CustomUserForm
from .models import Address, CustomUser, Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "phone", "address__city")
    search_fields = ("user__name", "phone", "address__city")


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    form = CustomUserForm
    add_form = CustomUserCreationForm
    list_display = ("name", "is_staff", "is_active")
    list_filter = (
        "is_staff",
        "is_active",
    )
    ordering = ("name",)
    search_fields = ("name", "email")

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

    def save_model(self, request, obj, form, change):
        """
        Override save_model to handle Profile and Address creation.
        """
        # Handle optional password
        password = form.cleaned_data.get("password", None)
        if password:
            obj.set_password(password)  # Hash and set the provided password
        else:
            obj.set_unusable_password()  # Set an unusable password if none is provided

        # Save the user first
        super().save_model(request, obj, form, change)

        # Handle Profile and Address creation
        if not change:  # Only create Profile and Address for new users
            if not obj.is_staff:
                address = Address.objects.create(
                    address_line=form.cleaned_data.get("address_line", ""),
                    address_line2=form.cleaned_data.get("address_line2", ""),
                    city=form.cleaned_data.get("city", ""),
                    postal_code=form.cleaned_data.get("postal_code", ""),
                )
                Profile.objects.create(
                    user=obj,
                    phone=form.cleaned_data.get("phone", ""),
                    address=address,
                    notes=form.cleaned_data.get("notes", ""),
                )
