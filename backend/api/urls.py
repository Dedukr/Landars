from django.urls import path

from .views import (
    CartView,
    CategoryList,
    OrderDetailView,
    OrderListView,
    ProductDetail,
    ProductList,
    UserOrdersView,
    WishlistView,
)

urlpatterns = [
    path("products/", ProductList.as_view(), name="product-list"),
    path("products/<int:product_id>/", ProductDetail.as_view(), name="product-detail"),
    path("categories/", CategoryList.as_view(), name="category-list"),
    path("wishlist/", WishlistView.as_view(), name="wishlist"),
    path("cart/", CartView.as_view(), name="cart"),
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/<int:order_id>/", OrderDetailView.as_view(), name="order-detail"),
    path("users/<int:user_id>/orders/", UserOrdersView.as_view(), name="user-orders"),
]
