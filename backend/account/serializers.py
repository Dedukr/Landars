from rest_framework import serializers

from .models import Address, BillingAddress, CustomUser, PaymentInformation, Profile
from .user_payload import billing_address_flat


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "id",
            "address_line",
            "address_line2",
            "city",
            "postal_code",
        ]


class BillingAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillingAddress
        fields = [
            "id",
            "company_name",
            "contact_name",
            "address_line",
            "address_line2",
            "city",
            "postal_code",
        ]


class ProfileSerializer(serializers.ModelSerializer):
    address = AddressSerializer(read_only=True)
    address_id = serializers.IntegerField(
        write_only=True, required=False, allow_null=True
    )
    billing_address = serializers.SerializerMethodField()
    bill_company_name = serializers.SerializerMethodField()
    bill_contact_name = serializers.SerializerMethodField()
    bill_address_line = serializers.SerializerMethodField()
    bill_address_line2 = serializers.SerializerMethodField()
    bill_city = serializers.SerializerMethodField()
    bill_postal_code = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "id",
            "phone",
            "address",
            "address_id",
            "notes",
            "bill_use_delivery_address",
            "bill_company_name",
            "bill_contact_name",
            "bill_address_line",
            "bill_address_line2",
            "bill_city",
            "bill_postal_code",
            "billing_address",
        ]
        read_only_fields = [
            "id",
            "billing_address",
            "bill_company_name",
            "bill_contact_name",
            "bill_address_line",
            "bill_address_line2",
            "bill_city",
            "bill_postal_code",
        ]

    def get_billing_address(self, obj):
        return obj.billing_address_fields()

    def _flat(self, obj):
        return billing_address_flat(obj.billing_address)

    def get_bill_company_name(self, obj):
        return self._flat(obj)["bill_company_name"]

    def get_bill_contact_name(self, obj):
        return self._flat(obj)["bill_contact_name"]

    def get_bill_address_line(self, obj):
        return self._flat(obj)["bill_address_line"]

    def get_bill_address_line2(self, obj):
        return self._flat(obj)["bill_address_line2"]

    def get_bill_city(self, obj):
        return self._flat(obj)["bill_city"]

    def get_bill_postal_code(self, obj):
        return self._flat(obj)["bill_postal_code"]

class PaymentInformationSerializer(serializers.ModelSerializer):
    card_number = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )
    cvv = serializers.CharField(write_only=True, required=False, allow_blank=True)
    masked_card_number = serializers.SerializerMethodField()

    class Meta:
        model = PaymentInformation
        fields = [
            "id",
            "card_number",
            "expiry_month",
            "expiry_year",
            "cvv",
            "is_default",
            "is_active",
            "masked_card_number",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "masked_card_number"]

    def get_masked_card_number(self, obj):
        """Return masked card number for display"""
        return obj.get_masked_card_number()

    def validate_card_number(self, value):
        """Validate card number format"""
        if value and len(value.replace(" ", "")) < 13:
            raise serializers.ValidationError("Card number must be at least 13 digits")
        return value

    def validate_expiry_month(self, value):
        """Validate expiry month"""
        if value and (value < 1 or value > 12):
            raise serializers.ValidationError("Expiry month must be between 1 and 12")
        return value

    def validate_expiry_year(self, value):
        """Validate expiry year"""
        if value and value < 2024:
            raise serializers.ValidationError("Expiry year must be 2024 or later")
        return value

    def validate(self, data):
        """Validate payment information"""
        # If setting as default, ensure no other payment method is default for this user
        if data.get("is_default") and self.instance:
            user = self.instance.user
            if (
                PaymentInformation.objects.filter(user=user, is_default=True)
                .exclude(id=self.instance.id)
                .exists()
            ):
                raise serializers.ValidationError(
                    "Another payment method is already set as default"
                )
        return data


class PaymentInformationListSerializer(serializers.ModelSerializer):
    """Serializer for listing payment methods (without sensitive data)"""

    masked_card_number = serializers.SerializerMethodField()

    class Meta:
        model = PaymentInformation
        fields = [
            "id",
            "expiry_month",
            "expiry_year",
            "is_default",
            "is_active",
            "masked_card_number",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "masked_card_number"]

    def get_masked_card_number(self, obj):
        """Return masked card number for display"""
        return obj.get_masked_card_number()


class CustomUserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)
    payment_methods = PaymentInformationListSerializer(many=True, read_only=True)

    class Meta:
        model = CustomUser
        fields = [
            "id",
            "name",
            "first_name",
            "surname",
            "email",
            "is_active",
            "profile",
            "payment_methods",
        ]
        read_only_fields = ["id", "is_active"]
