from django.urls import path

from festival.views import (
    FestivalCloudPRNTView,
    FestivalOrdersView,
    FestivalProductsView,
    FestivalPublicMenuView,
    FestivalStatusView,
)

urlpatterns = [
    path("menu/", FestivalPublicMenuView.as_view(), name="festival-public-menu"),
    path("products/", FestivalProductsView.as_view(), name="festival-products"),
    path("status/", FestivalStatusView.as_view(), name="festival-status"),
    path("orders/", FestivalOrdersView.as_view(), name="festival-orders"),
    path("cloudprnt/", FestivalCloudPRNTView.as_view(), name="festival-cloudprnt"),
]
