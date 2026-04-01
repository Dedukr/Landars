"""Shipping app HTTP API (mounted at ``/api/shipping/`` for URL stability)."""

from django.urls import path

from . import views

app_name = "shipping_api"

urlpatterns = [
    path("options/", views.get_shipping_options, name="shipping_options"),
    path("shipments/", views.create_shipment, name="create_shipment"),
    path(
        "shipments/<int:parcel_id>/", views.get_shipment_status, name="shipment_status"
    ),
    path("webhook/", views.sendcloud_webhook, name="sendcloud_webhook"),
]
