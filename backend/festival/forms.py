from django import forms

from festival.models import FestivalProduct


class FestivalProductAdminForm(forms.ModelForm):
    image_upload = forms.ImageField(
        required=False,
        help_text="Upload an image to Cloudflare R2 (compressed). Or set Image URL below.",
    )

    class Meta:
        model = FestivalProduct
        fields = ["name", "image_url", "price", "vat_rate", "is_active"]

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
