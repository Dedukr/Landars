"""Forms for billing admin tools."""

from django import forms


class PaymentStatementForm(forms.Form):
    from_date = forms.DateField(
        label="From",
        required=True,
        widget=forms.DateInput(attrs={"type": "date"}),
    )
    to_date = forms.DateField(
        label="To",
        required=True,
        widget=forms.DateInput(attrs={"type": "date"}),
    )
    output_format = forms.ChoiceField(
        label="Format",
        choices=(
            ("pdf", "PDF"),
            ("csv", "CSV"),
        ),
        initial="pdf",
        widget=forms.RadioSelect,
    )

    def clean(self):
        cleaned = super().clean()
        from_date = cleaned.get("from_date")
        to_date = cleaned.get("to_date")
        if from_date and to_date and from_date > to_date:
            self.add_error("to_date", "'From' date must be on or before 'To' date.")
        return cleaned
