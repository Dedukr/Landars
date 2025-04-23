# account/forms.py

from django import forms
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import Address, CustomUser, Profile


class CustomUserForm(UserChangeForm):
    name = forms.CharField(required=False)
    phone = forms.CharField(required=False)
    address_line = forms.CharField(label="Address Line", required=False)
    address_line2 = forms.CharField(label="Address Line 2", required=False)
    city = forms.CharField(label="City", required=False)
    postal_code = forms.CharField(label="Postal Code", required=False)
    country = forms.CharField(label="Country", required=False)
    notes = forms.CharField(label="Notes", required=False)

    class Meta:
        model = CustomUser
        fields = ("email", "password", "is_staff")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if self.instance and hasattr(self.instance, "profile"):
            self.fields["name"].initial = self.instance.profile.name
            self.fields["phone"].initial = self.instance.profile.phone
            self.fields["address"].initial = self.instance.profile.address
            self.fields["notes"].initial = self.instance.profile.notes

    def save(self, commit=True):
        user = super().save(commit=False)

        if commit:
            user.save()
            profile, created = Profile.objects.get_or_create(user=user)
            profile.name = self.cleaned_data.get("name")
            profile.phone = self.cleaned_data.get("phone")
            profile.address = self.cleaned_data.get("address")
            profile.notes = self.cleaned_data.get("notes")
            profile.save()

            address, created = Address.objects.get_or_create(user=user)
            address.address_line = self.cleaned_data.get("address_line")
            address.address_line2 = self.cleaned_data.get("address_line2")
            address.city = self.cleaned_data.get("city")
            address.postal_code = self.cleaned_data.get("postal_code")
            address.save()

        return user


class CustomUserCreationForm(UserCreationForm):
    # Profile fields
    name = forms.CharField(label="Name", required=False)
    phone = forms.CharField(label="Phone", required=False)

    # Address fields
    address_line = forms.CharField(label="Address Line", required=False)
    address_line2 = forms.CharField(label="Address Line 2", required=False)
    city = forms.CharField(label="City", required=False)
    postal_code = forms.CharField(label="Postal Code", required=False)
    country = forms.CharField(label="Country", required=False)
    notes = forms.CharField(label="Notes", required=False)

    class Meta:
        model = CustomUser
        fields = ("email", "password1", "password2", "is_active")

    def save(self, commit=True):
        user = super().save(commit=False)
        if commit:
            user.save()
            address = Address.objects.create(
                address_line=self.cleaned_data["address_line"],
                address_line2=self.cleaned_data.get("address_line2", ""),
                city=self.cleaned_data["city"],
                postal_code=self.cleaned_data["postal_code"],
            )

            Profile.objects.create(
                user=user,
                name=self.cleaned_data["name"],
                phone=self.cleaned_data["phone"],
                address=address,
                notes=self.cleaned_data.get("notes", ""),
            )
        return user
