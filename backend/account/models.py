import secrets
import uuid

from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from .name_utils import display_name_from_parts, split_legacy_name


class CustomUserManager(BaseUserManager):
    def create_user(
        self,
        name=None,
        email=None,
        password=None,
        *,
        first_name=None,
        surname=None,
        **extra_fields,
    ):
        if first_name or surname:
            first_name = (first_name or "").strip() or None
            surname = (surname or "").strip() or None
        elif name:
            first_name, surname = split_legacy_name((name or "").strip())
        else:
            raise ValueError("Name must be set")

        if not first_name:
            raise ValueError("Name must be set")

        if not email:
            raise ValueError("Email must be set")

        # Normalize email
        normalized_email = self.normalize_email(email)
        # Also lowercase the local part for consistency
        if "@" in normalized_email:
            local_part, domain = normalized_email.split("@", 1)
            email = f"{local_part.lower()}@{domain}"
        else:
            email = normalized_email

        # Check for email uniqueness (user-friendly error; DB also enforces)
        if self.filter(email=email).exists():
            raise ValueError("A user with this email already exists")

        user = self.model(
            name=name,
            email=email,
            first_name=first_name,
            surname=surname,
            **extra_fields,
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(
        self, name=None, email=None, password=None, *, first_name=None, surname=None, **extra_fields
    ):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        return self.create_user(
            name=name,
            email=email,
            password=password,
            first_name=first_name,
            surname=surname,
            **extra_fields,
        )


class CustomUser(AbstractBaseUser, PermissionsMixin):
    first_name = models.CharField(max_length=128, blank=True, null=True)
    surname = models.CharField(max_length=128, blank=True, null=True)
    # Legacy combined display name; kept in sync from first_name + surname when set.
    name = models.CharField(max_length=255, db_index=True, blank=True, null=True)
    # Email is the unique login identifier.
    # Keep DB nullable for legacy rows, but application logic enforces email for all new/updated users.
    email = models.EmailField(null=True, blank=True, unique=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)

    CREATED_SOURCE_WEBSITE = "website"
    CREATED_SOURCE_ADMIN = "admin"
    CREATED_SOURCE_SYSTEM = "system"
    CREATED_SOURCE_UNKNOWN = "unknown"
    CREATED_SOURCE_CHOICES = (
        (CREATED_SOURCE_WEBSITE, "Website"),
        (CREATED_SOURCE_ADMIN, "Admin"),
        (CREATED_SOURCE_SYSTEM, "System"),
        (CREATED_SOURCE_UNKNOWN, "Unknown"),
    )
    created_source = models.CharField(
        max_length=20,
        choices=CREATED_SOURCE_CHOICES,
        default=CREATED_SOURCE_UNKNOWN,
        db_index=True,
    )
    objects = CustomUserManager()

    USERNAME_FIELD = "email"  # field used to log in
    EMAIL_FIELD = "email"  # field used to send emails
    REQUIRED_FIELDS = ["name"]  # when creating superuser from CLI

    def __str__(self):
        return self.get_display_name() or (self.email or "")

    def get_display_name(self) -> str:
        return display_name_from_parts(
            self.first_name, self.surname, fallback_name=self.name
        )

    def sync_computed_name(self) -> None:
        """Keep legacy ``name`` aligned with first_name + surname."""
        self.name = self.get_display_name() or None

    def clean(self):
        """Validate the model before saving"""
        super().clean()
        if not self.email:
            # Legacy rows may have NULL email; application-level flows must enforce email.
            return
        # Normalize email before validation (lowercase domain part only)
        normalized_email = self.__class__.objects.normalize_email(self.email)
        # Also lowercase the local part for consistency
        if "@" in normalized_email:
            local_part, domain = normalized_email.split("@", 1)
            self.email = f"{local_part.lower()}@{domain}"
        else:
            self.email = normalized_email

        # Use the custom validator
        from .validators import validate_unique_email

        validate_unique_email(self.email, exclude_user_id=self.pk)

    def save(self, *args, **kwargs):
        # Skip validation if only updating specific fields like last_login
        # to avoid unnecessary validation errors during login
        update_fields = kwargs.get("update_fields")
        if update_fields and set(update_fields) <= {"last_login"}:
            # Only updating last_login, skip validation
            super().save(*args, **kwargs)
        else:
            # Run full validation (email normalization happens in clean())
            self.full_clean()
            if not update_fields or "name" in update_fields or {
                "first_name",
                "surname",
            } & set(update_fields):
                self.sync_computed_name()
                if update_fields is not None:
                    update_fields = set(update_fields) | {"name"}
                    kwargs["update_fields"] = list(update_fields)
            super().save(*args, **kwargs)


class Address(models.Model):
    """
    Address model for storing location information.
    Name and phone should be retrieved from User's Profile.
    """

    address_line = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)

    def __str__(self):
        return self.postal_code or "No Address"


class BillingAddress(models.Model):
    """
    Billing address belonging to a customer.

    Used as the customer's saved billing address (via Profile.billing_address)
    and as a per-order billing snapshot (via Order.billing_address).
    """

    customer = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="billing_addresses",
    )
    company_name = models.CharField(max_length=255, blank=True, null=True)
    contact_name = models.CharField(max_length=255, blank=True, null=True)
    address_line = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        verbose_name_plural = "Billing addresses"

    def __str__(self):
        label = (self.company_name or self.contact_name or "").strip()
        postal = (self.postal_code or "").strip()
        if label and postal:
            return f"{label} ({postal})"
        return label or postal or f"Billing address #{self.pk or 'new'}"

    def as_dict(self) -> dict[str, str | None]:
        return {
            "company_name": (self.company_name or "").strip() or None,
            "contact_name": (self.contact_name or "").strip() or None,
            "address_line": self.address_line,
            "address_line2": self.address_line2,
            "city": self.city,
            "postal_code": self.postal_code,
        }


class Profile(models.Model):
    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="profile"
    )
    # name = models.CharField(max_length=255, blank=True, null=True)
    phone = models.CharField(max_length=40, blank=True, null=True)
    address = models.ForeignKey(
        Address, on_delete=models.CASCADE, related_name="profiles", null=True
    )
    notes = models.TextField(blank=True, null=True)
    bill_use_delivery_address = models.BooleanField(default=True)
    billing_address = models.ForeignKey(
        BillingAddress,
        on_delete=models.SET_NULL,
        related_name="profiles",
        null=True,
        blank=True,
    )

    def __str__(self):
        return f"{self.user.name}'s Profile"

    def billing_address_fields(self, *, delivery_address=None) -> dict[str, str | None]:
        """
        Effective billing address for display.

        - If bill_use_delivery_address: use delivery street, keep company/contact
          from the saved BillingAddress when present.
        - Otherwise: use the saved BillingAddress row.
        """
        saved = self.billing_address
        company_name = (
            (saved.company_name or "").strip() or None if saved else None
        )
        contact_name = (
            (saved.contact_name or "").strip() or None if saved else None
        )

        if self.bill_use_delivery_address:
            address = delivery_address or self.address
            if address:
                return {
                    "company_name": company_name,
                    "contact_name": contact_name,
                    "address_line": address.address_line,
                    "address_line2": address.address_line2,
                    "city": address.city,
                    "postal_code": address.postal_code,
                }
            return {
                "company_name": company_name,
                "contact_name": contact_name,
                "address_line": None,
                "address_line2": None,
                "city": None,
                "postal_code": None,
            }

        if saved:
            return saved.as_dict()
        return {
            "company_name": None,
            "contact_name": None,
            "address_line": None,
            "address_line2": None,
            "city": None,
            "postal_code": None,
        }


class PaymentInformation(models.Model):
    """Model to store user payment information"""

    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="payment_methods"
    )
    card_number = models.CharField(
        max_length=19, blank=True, null=True
    )  # Encrypted in production
    expiry_month = models.PositiveIntegerField(blank=True, null=True)
    expiry_year = models.PositiveIntegerField(blank=True, null=True)
    cvv = models.CharField(
        max_length=4, blank=True, null=True
    )  # Encrypted in production
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Payment Information"
        ordering = ["-is_default", "-created_at"]
        # Ensure only one default payment method per user
        constraints = [
            models.UniqueConstraint(
                fields=["user", "is_default"],
                condition=models.Q(is_default=True),
                name="unique_default_payment_per_user",
            )
        ]

    def __str__(self):
        if self.card_number:
            # Show only last 4 digits for security
            masked_number = (
                f"**** **** **** {self.card_number[-4:]}"
                if len(self.card_number) >= 4
                else "****"
            )
            return f"{self.user.name} - {masked_number}"
        return f"{self.user.name}'s payment method"

    def save(self, *args, **kwargs):
        # If this is being set as default, unset other defaults for this user
        if self.is_default:
            PaymentInformation.objects.filter(user=self.user, is_default=True).exclude(
                id=self.id
            ).update(is_default=False)
        super().save(*args, **kwargs)

    def get_masked_card_number(self):
        """Return masked card number for display"""
        if self.card_number and len(self.card_number) >= 4:
            return f"**** **** **** {self.card_number[-4:]}"
        return "****"

    def get_payment_details(self):
        """Return payment details for API responses"""
        return {
            "id": self.id,
            "card_number": self.get_masked_card_number(),
            "expiry_month": self.expiry_month,
            "expiry_year": self.expiry_year,
            "is_default": self.is_default,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class PasswordResetToken(models.Model):
    """Model to store password reset tokens with enhanced security"""

    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="password_reset_tokens"
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    is_used = models.BooleanField(default=False, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_used", "expires_at"]),
            models.Index(fields=["token", "is_used"]),
        ]

    def __str__(self):
        return f"Password reset token for {self.user.email}"

    def save(self, *args, **kwargs):
        if not self.token:
            # Generate cryptographically secure token
            self.token = secrets.token_urlsafe(32)
        if not self.expires_at:
            from django.conf import settings
            from django.utils import timezone

            # Shorter expiration for better security (15 minutes)
            self.expires_at = timezone.now() + timezone.timedelta(
                seconds=getattr(settings, "PASSWORD_RESET_TIMEOUT", 900)  # 15 minutes
            )
        super().save(*args, **kwargs)

    def is_valid(self):
        """Check if token is valid and not expired"""
        from django.utils import timezone

        return not self.is_used and timezone.now() < self.expires_at

    def mark_as_used(self):
        """Mark token as used with timestamp"""
        from django.utils import timezone

        self.is_used = True
        self.used_at = timezone.now()
        self.save(update_fields=["is_used", "used_at"])

    @classmethod
    def cleanup_expired_tokens(cls):
        """Clean up expired tokens"""
        from django.utils import timezone

        expired_count = cls.objects.filter(expires_at__lt=timezone.now()).delete()[0]
        return expired_count

    @classmethod
    def invalidate_all_user_tokens(cls, user):
        """Invalidate all tokens for a specific user"""
        tokens_count = cls.objects.filter(user=user).count()
        cls.objects.filter(user=user).update(is_used=True)
        return tokens_count

    @classmethod
    def invalidate_unused_user_tokens(cls, user):
        """Invalidate all unused tokens for a specific user"""
        unused_count = cls.objects.filter(user=user, is_used=False).count()
        cls.objects.filter(user=user, is_used=False).update(is_used=True)
        return unused_count


class EmailVerificationToken(models.Model):
    """Model to store email verification tokens with enhanced security"""

    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="email_verification_tokens"
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    is_used = models.BooleanField(default=False, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)
    email_sent_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_used", "expires_at"]),
            models.Index(fields=["token", "is_used"]),
        ]

    def __str__(self):
        return f"Email verification token for {self.user.email}"

    def save(self, *args, **kwargs):
        if not self.token:
            # Generate cryptographically secure token
            self.token = secrets.token_urlsafe(32)
        if not self.expires_at:
            from django.conf import settings
            from django.utils import timezone

            # Email verification tokens expire in 24 hours
            self.expires_at = timezone.now() + timezone.timedelta(
                seconds=getattr(
                    settings, "EMAIL_VERIFICATION_TIMEOUT", 86400
                )  # 24 hours
            )
        super().save(*args, **kwargs)

    def is_valid(self):
        """Check if token is valid and not expired"""
        from django.utils import timezone

        return not self.is_used and timezone.now() < self.expires_at

    def mark_as_used(self):
        """Mark token as used with timestamp"""
        from django.utils import timezone

        self.is_used = True
        self.used_at = timezone.now()
        self.save(update_fields=["is_used", "used_at"])

    @classmethod
    def cleanup_expired_tokens(cls):
        """Clean up expired tokens"""
        from django.utils import timezone

        expired_count = cls.objects.filter(expires_at__lt=timezone.now()).delete()[0]
        return expired_count

    @classmethod
    def invalidate_all_user_tokens(cls, user):
        """Invalidate all tokens for a specific user"""
        tokens_count = cls.objects.filter(user=user).count()
        cls.objects.filter(user=user).update(is_used=True)
        return tokens_count

    @classmethod
    def invalidate_unused_user_tokens(cls, user):
        """Invalidate all unused tokens for a specific user"""
        unused_count = cls.objects.filter(user=user, is_used=False).count()
        cls.objects.filter(user=user, is_used=False).update(is_used=True)
        return unused_count
