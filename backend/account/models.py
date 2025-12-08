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


class CustomUserManager(BaseUserManager):
    def create_user(self, name, email=None, password=None, **extra_fields):
        if not name:
            raise ValueError("Name must be set")

        # Normalize email if provided
        if email:
            email = self.normalize_email(email)
            # Check for email uniqueness
            if self.filter(email=email).exists():
                raise ValueError("A user with this email already exists")

        user = self.model(name=name, email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, name, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        return self.create_user(name, password, **extra_fields)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    name = models.CharField(max_length=255, unique=True)
    email = models.EmailField(null=True, blank=True, unique=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    objects = CustomUserManager()

    USERNAME_FIELD = "email"  # field used to log in
    EMAIL_FIELD = "email"  # field used to send emails
    REQUIRED_FIELDS = ["name"]  # when creating superuser from CLI

    def __str__(self):
        # return self.profile.name if hasattr(self, "profile") else self.email
        return self.name

    def clean(self):
        """Validate the model before saving"""
        super().clean()
        if self.email:
            # Normalize email before validation
            self.email = self.__class__.objects.normalize_email(self.email)
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
            super().save(*args, **kwargs)


class Address(models.Model):
    address_line = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    # country = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return f"{self.postal_code}" or "No Address"


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

    def __str__(self):
        return f"{self.user.name}'s Profile"


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
