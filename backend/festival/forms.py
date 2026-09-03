from django import forms

from festival.models import FestivalFilling, FestivalProduct


class FestivalProductAdminForm(forms.ModelForm):
    image_upload = forms.ImageField(
        required=False,
        help_text="Upload an image to Cloudflare R2 (compressed). Or set Image URL below.",
    )

    class Meta:
        model = FestivalProduct
        fields = [
            "name",
            "category",
            "addition_class",
            "image_url",
            "price",
            "vat_rate",
            "portion",
            "description",
            "ingredients",
            "toppings",
            "allergens",
            "is_active",
            "created_at",
        ]

    def save(self, commit=True):
        instance = super().save(commit=False)
        upload = self.cleaned_data.get("image_upload")
        if upload:
            from api.r2_storage import upload_compressed_image_to_r2

            result = upload_compressed_image_to_r2(
                upload,
                upload.name,
                folder=f"festival/products/{instance.pk or 'temp'}",
            )
            instance.image_url = result["public_url"]
        if commit:
            instance.save()
        return instance


class FestivalFillingInlineForm(forms.ModelForm):
    image_upload = forms.ImageField(
        required=False,
        help_text="Upload to R2 (compressed). Or set Image URL.",
    )

    class Meta:
        model = FestivalFilling
        fields = ["name", "image_url", "description", "allergens", "is_active"]

    def save(self, commit=True):
        instance = super().save(commit=False)
        upload = self.cleaned_data.get("image_upload")
        if upload:
            from api.r2_storage import upload_compressed_image_to_r2

            product_id = instance.product_id or "temp"
            filling_id = instance.pk or "temp"
            result = upload_compressed_image_to_r2(
                upload,
                upload.name,
                folder=f"festival/fillings/{product_id}/{filling_id}",
            )
            instance.image_url = result["public_url"]
        if commit:
            instance.save()
        return instance


class FestivalCancelOrderForm(forms.Form):
    reason = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
        help_text="Reason recorded on the credit note and cancellation tickets.",
    )
    confirm = forms.BooleanField(
        required=True,
        label="I confirm full cancellation and credit note issuance",
    )
