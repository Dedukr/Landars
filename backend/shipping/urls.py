"""
Shipping API URLs
"""

from django.urls import path

from . import views

app_name = "shipping"

urlpatterns = [
    # Get shipping options for address + items
    path("options/", views.get_shipping_options, name="shipping_options"),
    # Create a shipment for an order
    path("shipments/", views.create_shipment, name="create_shipment"),
    # Get shipment status
    path(
        "shipments/<int:parcel_id>/", views.get_shipment_status, name="shipment_status"
    ),
    # SendCloud webhook endpoint (no authentication required)
    path("webhook/", views.sendcloud_webhook, name="sendcloud_webhook"),
]
