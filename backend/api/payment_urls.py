"""
URL patterns for Stripe payment processing
"""
from django.urls import path
from . import payments

urlpatterns = [
    path('create-payment-intent/', payments.create_payment_intent, name='create_payment_intent'),
    path('payment-intent/<str:payment_intent_id>/status/', payments.get_payment_intent_status, name='payment_intent_status'),
    path('create-customer/', payments.create_customer, name='create_customer'),
    path('webhook/', payments.stripe_webhook, name='stripe_webhook'),
]
