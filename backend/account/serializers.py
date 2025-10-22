from rest_framework import serializers

from .models import Address, CustomUser, PaymentInformation, Profile


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


class ProfileSerializer(serializers.ModelSerializer):
    address = AddressSerializer(read_only=True)
    address_id = serializers.IntegerField(
        write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Profile
        fields = [
            "id",
            "phone",
            "address",
            "address_id",
            "notes",
        ]
        read_only_fields = ["id"]


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
            "email",
            "is_active",
            "profile",
            "payment_methods",
        ]
        read_only_fields = ["id", "is_active"]
