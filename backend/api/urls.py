from django.urls import path

from .views import (
    ProductList,
    ProductDetail,
    CategoryList,
    CompressedImageUploadView,
    PresignedUploadView,
    CartView,
    WishlistView,
    OrderDetailView,
    OrderListView,
    OrderCreateView,
    OrderItemView,
    UserOrdersView,
)

urlpatterns = [
    # Product endpoints
    path("products/", ProductList.as_view(), name="product-list"),
    path("products/<int:product_id>/", ProductDetail.as_view(), name="product-detail"),
    # Image upload endpoints
    path(
        "images/presigned-upload/",
        PresignedUploadView.as_view(),
        name="presigned-upload",
    ),
    path(
        "images/upload/", CompressedImageUploadView.as_view(), name="compressed-upload"
    ),
    path("categories/", CategoryList.as_view(), name="category-list"),
    path("wishlist/", WishlistView.as_view(), name="wishlist"),
    path("cart/", CartView.as_view(), name="cart"),
    # Order endpoints
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/create/", OrderCreateView.as_view(), name="order-create"),
    path("orders/<int:order_id>/", OrderDetailView.as_view(), name="order-detail"),
    path(
        "orders/<int:order_id>/items/",
        OrderListItemsView.as_view(),
        name="order-item-create",
    ),
    path(
        "orders/<int:order_id>/items/<int:item_id>/",
        OrderItemView.as_view(),
        name="order-item-delete",
    ),
    path("users/<int:user_id>/orders/", UserOrdersView.as_view(), name="user-orders"),
]
