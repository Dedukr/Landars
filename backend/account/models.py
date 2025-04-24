from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models


class CustomUserManager(BaseUserManager):
    def create_user(self, name, password=None, **extra_fields):
        if not name:
            raise ValueError("Name must be set")
        # email = self.normalize_email(email)
        # user = self.model(email=email, **extra_fields)
        # user.set_password(password)
        user = self.model(name=name, **extra_fields)
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
    objects = CustomUserManager()

    USERNAME_FIELD = "name"  # field used to log in
    EMAIL_FIELD = "email"  # field used to send emails
    REQUIRED_FIELDS = []  # when creating superuser from CLI

    def __str__(self):
        # return self.profile.name if hasattr(self, "profile") else self.email
        return self.name


class Address(models.Model):
    address_line = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)

    def __str__(self):
        return f"{self.postal_code}" or "No Address"


class Profile(models.Model):
    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="profile"
    )
    # name = models.CharField(max_length=255, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.ForeignKey(
        Address, on_delete=models.CASCADE, related_name="profiles", null=True
    )
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.user.name}'s Profile"
