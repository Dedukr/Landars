from api.models import Order
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.urls import reverse
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .forms import CustomUserCreationForm, CustomUserForm
from .models import Address, CustomUser, Profile


class OrderInline(admin.TabularInline):  # or StackedInline if you want vertical
    model = Order
    extra = 0  # no empty new forms
    fields = ("order_link", "status", "notes", "total_price")
    readonly_fields = ("order_link", "total_price")

    def order_link(self, obj):
        url = reverse(
            "admin:api_order_change", args=[obj.pk]
        )  # Update "api_orders_change" to match your app
        if obj.delivery_date:
            date_text = obj.delivery_date.strftime("%B %d, %Y")
        else:
            date_text = "-"
        return format_html(
            '<a href="{}" style="color:#0a7;">🛒 {}</a>',
            url,
            date_text,
        )

    order_link.short_description = "Order Date"

    def total_price(self, obj):
        return obj.total_price

    total_price.short_description = "Total Price"


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    form = CustomUserForm
    add_form = CustomUserCreationForm
    list_display = (
        "full_name",
        "phone_whatsapp",
        "email",
        "is_active",
        "is_staff",
    )
    list_filter = (
        "is_staff",
        "is_active",
    )
    ordering = ("email",)
    search_fields = ("first_name", "surname", "name", "email", "profile__phone")

    class Media:
        js = ("admin/js/prevent_double_submit.js",)

    fieldsets = [
        (None, {"fields": ("name", "email", "password", "is_email_verified")}),
    ]
    add_fieldsets = [
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "first_name",
                    "surname",
                    "email",
                    "password",
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
        if request.user.has_perm("account.change_customuser"):
            permission_fields = ["is_active", "is_staff", "groups"]
            if request.user.is_superuser:
                permission_fields.extend(["is_superuser", "user_permissions"])
            elif request.user.has_perm("auth.change_permission"):
                permission_fields.append("user_permissions")
            fieldsets = fieldsets + [
                (_("Permissions"), {"fields": tuple(permission_fields)}),
                (_("Important dates"), {"fields": ("last_login",)}),
            ]
        return fieldsets

    get_inlines = lambda self, request, obj: (
        [OrderInline] if obj and not obj.is_staff else []
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("profile")

    @admin.display(description="Name", ordering="name")
    def full_name(self, obj):
        return obj.get_display_name() or "-"

    @admin.display(description="Phone")
    def phone_whatsapp(self, obj):
        phone = None
        profile = getattr(obj, "profile", None)
        if profile:
            phone = (profile.phone or "").strip()
        if not phone:
            return "-"

        # WhatsApp expects an international number without '+' or formatting.
        digits = "".join(ch for ch in phone if ch.isdigit())
        if not digits:
            return phone

        return format_html(
            '<a href="https://wa.me/{}" target="_blank" rel="noreferrer">{}</a>',
            digits,
            phone,
        )

    def get_search_results(self, request, queryset, search_term):
        queryset, use_distinct = super().get_search_results(
            request, queryset, search_term
        )
        # Only filter out staff for autocomplete requests
        if request.path.endswith("/autocomplete/"):
            queryset = queryset.filter(is_staff=False)
        return queryset, use_distinct

    def save_model(self, request, obj, form, change):
        """
        Override save_model to handle Profile and Address creation.
        """
        # IMPORTANT:
        # - On the change form, Django's `UserChangeForm` provides a hashed password value.
        #   Re-hashing it here would break logins. Password changes must go through the
        #   dedicated "change password" admin view.
        # - On the add form, we accept a raw password and hash it once.
        if not change:
            password = form.cleaned_data.get("password", None)
            if password:
                obj.set_password(password)
            else:
                obj.set_unusable_password()
            # Mark source so merge prefers website-created users.
            if hasattr(obj, "CREATED_SOURCE_ADMIN"):
                obj.created_source = obj.CREATED_SOURCE_ADMIN

        # Save the user first
        super().save_model(request, obj, form, change)

        # Handle Profile and Address creation
        if not change:  # Only create Profile and Address for new users
            if not obj.is_staff:
                # The user-merge signal may have reassigned an existing Profile
                # to this newly-created user. Keep this creation path idempotent.
                profile, created_profile = Profile.objects.get_or_create(user=obj)

                if created_profile or profile.address is None:
                    address = Address.objects.create(
                        address_line=form.cleaned_data.get("address_line", ""),
                        address_line2=form.cleaned_data.get("address_line2", ""),
                        city=form.cleaned_data.get("city", ""),
                        postal_code=form.cleaned_data.get("postal_code", ""),
                    )
                    profile.address = address

                # Only fill blanks; don't overwrite values potentially merged in.
                phone = (form.cleaned_data.get("phone") or "").strip()
                if phone and not (profile.phone or "").strip():
                    profile.phone = phone

                notes = (form.cleaned_data.get("notes") or "").strip()
                if notes and not (profile.notes or "").strip():
                    profile.notes = notes

                profile.save()

    def response_add(self, request, obj, post_url_continue=None):
        """
        Redirect to the user list view after adding a new user.
        """
        from django.http import HttpResponseRedirect
        from django.urls import reverse

        # Redirect to the user list view
        return HttpResponseRedirect(reverse("admin:account_customuser_changelist"))
