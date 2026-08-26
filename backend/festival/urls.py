from django.urls import path

from festival.views import (
    FestivalCloudPRNTView,
    FestivalOrdersView,
    FestivalPrinterUnstickView,
    FestivalProductsView,
    FestivalStatusView,
)

urlpatterns = [
    path("products/", FestivalProductsView.as_view(), name="festival-products"),
    path("status/", FestivalStatusView.as_view(), name="festival-status"),
    path("orders/", FestivalOrdersView.as_view(), name="festival-orders"),
    path(
        "printer/unstick/",
        FestivalPrinterUnstickView.as_view(),
        name="festival-printer-unstick",
    ),
    path("cloudprnt/", FestivalCloudPRNTView.as_view(), name="festival-cloudprnt"),
]
