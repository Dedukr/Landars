# account/forms.py

from django import forms
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .address_validation import validate_street_address
from .billing_address import upsert_profile_billing_address
from .models import Address, CustomUser, Profile


def _validate_billing_street_when_required(form, cleaned_data):
    """
    When not using delivery as billing, require street fields
    (same rules as delivery: line2 optional, UK postcode).
    """
    if cleaned_data.get("bill_use_delivery_address", True):
        return cleaned_data

    errors = validate_street_address(
        address_line=cleaned_data.get("bill_address_line"),
        address_line2=cleaned_data.get("bill_address_line2"),
        city=cleaned_data.get("bill_city"),
        postal_code=cleaned_data.get("bill_postal_code"),
        require_line2=False,
    )
    field_map = {
        "address_line": "bill_address_line",
        "address_line2": "bill_address_line2",
        "city": "bill_city",
        "postal_code": "bill_postal_code",
    }
    for key, message in errors.items():
        form.add_error(field_map[key], message)
    return cleaned_data


class CustomUserForm(UserChangeForm):
    first_name = forms.CharField(label="First name", required=False)
    surname = forms.CharField(label="Surname", required=False)
    phone = forms.CharField(required=False)
    address_line = forms.CharField(label="Delivery address line", required=False)
    address_line2 = forms.CharField(label="Delivery address line 2", required=False)
    city = forms.CharField(label="Delivery city", required=False)
    postal_code = forms.CharField(label="Delivery postal code", required=False)
    notes = forms.CharField(label="Notes", required=False)
    bill_use_delivery_address = forms.BooleanField(
        label="Use delivery address as billing address",
        required=False,
        initial=True,
    )
    bill_company_name = forms.CharField(
        label="Billing company name", required=False
    )
    bill_contact_name = forms.CharField(
        label="Billing contact name", required=False
    )
    bill_address_line = forms.CharField(label="Billing address line", required=False)
    bill_address_line2 = forms.CharField(label="Billing address line 2", required=False)
    bill_city = forms.CharField(label="Billing city", required=False)
    bill_postal_code = forms.CharField(label="Billing postal code", required=False)

    class Meta:
        model = CustomUser
        fields = (
            "first_name",
            "surname",
            "email",
            "password",
            "is_staff",
            "is_email_verified",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if self.instance.pk:
            profile = getattr(self.instance, "profile", None)
            if profile:
                self.fields["phone"].initial = profile.phone
                self.fields["notes"].initial = profile.notes
                self.fields["bill_use_delivery_address"].initial = (
                    profile.bill_use_delivery_address
                )
                billing = profile.billing_address
                if billing:
                    self.fields["bill_company_name"].initial = billing.company_name
                    self.fields["bill_contact_name"].initial = billing.contact_name
                    self.fields["bill_address_line"].initial = billing.address_line
                    self.fields["bill_address_line2"].initial = billing.address_line2
                    self.fields["bill_city"].initial = billing.city
                    self.fields["bill_postal_code"].initial = billing.postal_code
                address = profile.address
                if address:
                    self.fields["address_line"].initial = address.address_line
                    self.fields["address_line2"].initial = address.address_line2
                    self.fields["city"].initial = address.city
                    self.fields["postal_code"].initial = address.postal_code

    def clean(self):
        cleaned_data = super().clean()
        return _validate_billing_street_when_required(self, cleaned_data)

    def save(self, commit=True):
        user = super().save(commit=False)

        # Name is derived from first_name + surname; never keep a stale legacy name.
        if "first_name" in self.cleaned_data:
            user.first_name = (self.cleaned_data.get("first_name") or "").strip() or None
        if "surname" in self.cleaned_data:
            user.surname = (self.cleaned_data.get("surname") or "").strip() or None
        user.sync_computed_name()

        if commit:
            user.save()

        profile, _ = Profile.objects.get_or_create(user=user)
        profile.phone = self.cleaned_data.get("phone")

        address = profile.address or Address()
        address.address_line = self.cleaned_data.get("address_line")
        address.address_line2 = self.cleaned_data.get("address_line2")
        address.city = self.cleaned_data.get("city")
        address.postal_code = self.cleaned_data.get("postal_code")
        address.save()

        profile.address = address
        profile.notes = self.cleaned_data.get("notes")
        profile.bill_use_delivery_address = self.cleaned_data.get(
            "bill_use_delivery_address", True
        )
        upsert_profile_billing_address(
            profile,
            {
                "company_name": self.cleaned_data.get("bill_company_name"),
                "contact_name": self.cleaned_data.get("bill_contact_name"),
                "address_line": self.cleaned_data.get("bill_address_line"),
                "address_line2": self.cleaned_data.get("bill_address_line2"),
                "city": self.cleaned_data.get("bill_city"),
                "postal_code": self.cleaned_data.get("bill_postal_code"),
            },
        )
        profile.save()

        return user


class CustomUserCreationForm(forms.ModelForm):
    # Profile fields
    # name = forms.CharField(label="Name", required=True)
    phone = forms.CharField(label="Phone", required=False)

    # Address fields
    address_line = forms.CharField(label="Address Line", required=False)
    address_line2 = forms.CharField(label="Address Line 2", required=False)
    city = forms.CharField(label="City", required=False)
    postal_code = forms.CharField(label="Postal Code", required=False)
    notes = forms.CharField(label="Notes", required=False)
    bill_use_delivery_address = forms.BooleanField(
        label="Use delivery address as billing address",
        required=False,
        initial=True,
    )
    bill_company_name = forms.CharField(
        label="Billing company name", required=False
    )
    bill_contact_name = forms.CharField(
        label="Billing contact name", required=False
    )
    bill_address_line = forms.CharField(label="Billing address line", required=False)
    bill_address_line2 = forms.CharField(label="Billing address line 2", required=False)
    bill_city = forms.CharField(label="Billing city", required=False)
    bill_postal_code = forms.CharField(label="Billing postal code", required=False)
    password = forms.CharField(
        label="Password",
        widget=forms.PasswordInput,
        help_text="Leave blank to set an unusable password.",
        required=False,
    )

    class Meta:
        model = CustomUser
        fields = ("first_name", "surname", "email")

    def clean(self):
        cleaned_data = super().clean()
        return _validate_billing_street_when_required(self, cleaned_data)
