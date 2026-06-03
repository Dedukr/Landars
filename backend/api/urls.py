from django.urls import include, path

from .views import (
    ProductList,
    ProductDetail,
    ProductReviewListCreate,
    CategoryGroupList,
    CategoryGroupPostDelivery,
    CategoryList,
    CompressedImageUploadView,
    PresignedUploadView,
    CartView,
    WishlistView,
    OrderDetailView,
    OrderListView,
    OrderItemView,
    UserOrdersView,
)

urlpatterns = [
    path("dashboard/", include("api.admin_api.urls")),
    # /api/admin/dashboard/ is now served by admin_dashboard.urls (backend/urls.py)
    # Product endpoints
    path("products/", ProductList.as_view(), name="product-list"),
    path("products/<int:product_id>/", ProductDetail.as_view(), name="product-detail"),
    path(
        "products/<int:product_id>/reviews/",
        ProductReviewListCreate.as_view(),
        name="product-review-list-create",
    ),
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
    path("category-groups/", CategoryGroupList.as_view(), name="category-group-list"),
    path(
        "category-groups/post-delivery/",
        CategoryGroupPostDelivery.as_view(),
        name="category-group-post-delivery",
    ),
    path("wishlist/", WishlistView.as_view(), name="wishlist"),
    path("cart/", CartView.as_view(), name="cart"),
    # Order endpoints
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/<int:order_id>/", OrderDetailView.as_view(), name="order-detail"),
    path(
        "orders/<int:order_id>/items/<int:item_id>/",
        OrderItemView.as_view(),
        name="order-item",
    ),
    path("users/<int:user_id>/orders/", UserOrdersView.as_view(), name="user-orders"),
]
