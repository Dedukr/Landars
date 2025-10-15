from django.urls import path

from .views import (
    ProductDetail, ProductList, OrderListCreateView, 
    OrderDetailView, OrderItemView
)

urlpatterns = [
    # Product endpoints
    path("products/", ProductList.as_view(), name="product-list"),
    path("products/<int:product_id>/", ProductDetail.as_view(), name="product-detail"),
    
    # Order endpoints with duplicate prevention
    path("orders/", OrderListCreateView.as_view(), name="order-list-create"),
    path("orders/<int:order_id>/", OrderDetailView.as_view(), name="order-detail"),
    path("orders/<int:order_id>/items/", OrderItemView.as_view(), name="order-item-create"),
    path("orders/<int:order_id>/items/<int:item_id>/", OrderItemView.as_view(), name="order-item-delete"),
]
