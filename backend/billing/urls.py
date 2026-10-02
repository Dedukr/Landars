from django.urls import path

from billing import views

urlpatterns = [
    # No trailing slash: APPEND_SLASH is False, and public_payment_url omits it.
    path(
        "invoice/<str:token>/status",
        views.pay_invoice_status,
        name="pay_invoice_status",
    ),
    path(
        "invoice/<str:token>",
        views.pay_invoice,
        name="pay_invoice",
    ),
]
