from django import forms

from .models import CustomUser, Order


class OrderAdminForm(forms.ModelForm):
    class Meta:
        model = Order
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Filter only non-staff users
        if "customer" in self.fields:
            self.fields["customer"].queryset = CustomUser.objects.filter(
                is_staff=False, is_active=True
            )

            # Customize label to show name
            self.fields["customer"].label_from_instance = lambda obj: obj.name
