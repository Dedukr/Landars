from django import forms
from django.contrib import admin
from django.contrib.admin import TabularInline
from django.core.exceptions import ValidationError
from django.forms.models import BaseInlineFormSet
from django.utils.translation import gettext_lazy as _

from .models import CustomUser, Order, OrderItem, Stock


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 1


class OrderAdminForm(forms.ModelForm):
    # customer = forms.ModelChoiceField(
    #     queryset=CustomUser.objects.filter(is_staff=False, is_active=True),
    #     label="Customer",
    # )
    # notes = forms.CharField(
    #     label="Notes",
    #     required=False,
    #     widget=forms.Textarea(attrs={"rows": 3}),
    # )
    # delivery_date = forms.DateField(
    #     label="Order Date",
    #     widget=forms.DateInput(attrs={"type": "date"}),
    # )
    # status = forms.ChoiceField(
    #     label="Status",
    #     choices=Order.status.field.choices,
    #     initial=Order.status.field.choices[0][1],
    #     widget=forms.Select(attrs={"class": "form-control"}),
    # )
    # inline = [OrderItemInline]

    class Meta:
        model = Order
        # fields = "__all__"
        fields = [
            "customer",
        ]
        widgets = {
            "delivery_date": forms.DateInput(format="%d %B %Y", attrs={"type": "date"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # # Filter only non-staff users
        # if "customer" in self.fields:
        #     self.fields["customer"].queryset = CustomUser.objects.filter(
        #         is_staff=False, is_active=True
        #     )

        #     # Customize label to show name
        #     self.fields["customer"].label_from_instance = lambda obj: obj.name


class OrderCreateForm(forms.ModelForm):
    customer = forms.ModelChoiceField(
        queryset=CustomUser.objects.filter(is_staff=False, is_active=True),
        label="Customer",
    )
    notes = forms.CharField(
        label="Notes",
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
    )
    status = forms.ChoiceField(
        label="Status",
        choices=Order.status.field.choices,
        initial=Order.status.field.choices[0][1],
        widget=forms.Select(attrs={"class": "form-control"}),
    )
    inline = [OrderItemInline]

    class Meta:
        model = Order
        fields = [
            "customer",
            "notes",
            "status",
        ]

    # def __init__(self, *args, **kwargs):
    #     super().__init__(*args, **kwargs)

    #     # Filter only non-staff users
    #     if "customer" in self.fields:
    #         self.fields["customer"].queryset = CustomUser.objects.filter(
    #             is_staff=False, is_active=True
    #         )

    #         # Customize label to show name
    #         self.fields["customer"].label_from_instance = lambda obj: obj.name
