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

        if self.instance.pk:
            profile = getattr(self.instance, "profile", None)
            if profile:
                # self.fields["name"].initial = profile.name
                self.fields["phone"].initial = profile.phone
                self.fields["notes"].initial = profile.notes
                address = profile.address
                if address:
                    self.fields["address_line"].initial = address.address_line
                    self.fields["address_line2"].initial = address.address_line2
                    self.fields["city"].initial = address.city
                    self.fields["postal_code"].initial = address.postal_code

        # if self.instance and hasattr(self.instance, "profile"):
        #     self.fields["name"].initial = self.instance.profile.name
        #     self.fields["phone"].initial = self.instance.profile.phone
        #     self.fields["address"].initial = self.instance.profile.address
        #     self.fields["notes"].initial = self.instance.profile.notes

    def save(self, commit=True):
        user = super().save(commit)
        profile, _ = Profile.objects.get_or_create(user=user)
        profile.name = self.cleaned_data.get("name")
        profile.phone = self.cleaned_data.get("phone")

        address = profile.address or Address()
        address.address_line = self.cleaned_data.get("address_line")
        address.address_line2 = self.cleaned_data.get("address_line2")
        address.city = self.cleaned_data.get("city")
        address.postal_code = self.cleaned_data.get("postal_code")
        address.save()

        profile.address = address
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
    country = forms.CharField(label="Country", required=False)
    notes = forms.CharField(label="Notes", required=False)
    password = forms.CharField(
        label="Password",
        widget=forms.PasswordInput,
        help_text="Leave blank to set an unusable password.",
        required=False,
    )

    class Meta:
        model = CustomUser
        fields = ("name",)

        # def save(self, commit=True):
        #     user = super().save(commit=False)
        #     password = self.cleaned_data.get("password")
        #     if password:
        #         user.set_password(password)
        #     else:
        #         user.set_unusable_password()
        #         pass
        #     if commit:
        #         user.save()
        #         address = Address.objects.create(
        #             address_line=self.cleaned_data.get("address_line", ""),
        #             address_line2=self.cleaned_data.get("address_line2", ""),
        #             city=self.cleaned_data.get("city", ""),
        #             postal_code=self.cleaned_data.get("postal_code", ""),
        #         )

        #         Profile.objects.create(
        #             user=user,
        #             # name=self.cleaned_data["name"],
        #             phone=self.cleaned_data.get("phone", ""),
        #             address=address,
        #             notes=self.cleaned_data.get("notes", ""),
        #         )

        # return user
