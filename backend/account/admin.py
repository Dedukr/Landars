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
        return format_html(
            '<a href="{}" style="color:#0a7;">🛒 {}</a>',
            url,
            obj.order_date.strftime("%B %d, %Y, %H:%M"),
        )

    order_link.short_description = "Order Date"

    def total_price(self, obj):
        return obj.total_price

    total_price.short_description = "Total Price"


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

    get_inlines = lambda self, request, obj: (
        [OrderInline] if obj and not obj.is_staff else []
    )

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # Only show root user to superusers
        if request.user.is_superuser:
            return qs
        return qs.exclude(
            is_superuser=True
        )  # or exclude(id=1), or name="root" if that's root

    def has_change_permission(self, request, obj=None):
        if obj and obj.is_superuser and not request.user.is_superuser:
            return False
        return super().has_change_permission(request, obj)
    
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

    def response_add(self, request, obj, post_url_continue=None):
        """
        Redirect to the user list view after adding a new user.
        """
        from django.http import HttpResponseRedirect
        from django.urls import reverse

        # Redirect to the user list view
        return HttpResponseRedirect(reverse("admin:account_customuser_changelist"))
