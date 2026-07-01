from django.urls import path

from .views import (
    ProductList,
    ProductDetail,
    ProductReviewListCreate,
    ShopReviewListCreate,
    FeaturedReviewList,
    ReviewHighlightsView,
    ShopReviewView,
    ShopReviewMeView,
    CategoryGroupList,
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
from .admin_views import AdminReviewListView, AdminReviewDetailView

urlpatterns = [
    # Product endpoints
    path("products/", ProductList.as_view(), name="product-list"),
    path("products/<int:product_id>/", ProductDetail.as_view(), name="product-detail"),
    path(
        "products/<int:product_id>/reviews/",
        ProductReviewListCreate.as_view(),
        name="product-review-list-create",
    ),
    # Reviews — new canonical endpoints
    path("reviews/highlights/", ReviewHighlightsView.as_view(), name="review-highlights"),
    path("reviews/shop/", ShopReviewView.as_view(), name="shop-review"),
    path("reviews/shop/me/", ShopReviewMeView.as_view(), name="shop-review-me"),
    # Reviews — legacy aliases (kept for backward compatibility)
    path("shop-reviews/", ShopReviewListCreate.as_view(), name="shop-review-list-create"),
    path("reviews/featured/", FeaturedReviewList.as_view(), name="featured-review-list"),
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
    # Admin API — reviews management (staff only)
    path("admin/reviews/", AdminReviewListView.as_view(), name="admin-review-list"),
    path("admin/reviews/<int:review_id>/", AdminReviewDetailView.as_view(), name="admin-review-detail"),
]
