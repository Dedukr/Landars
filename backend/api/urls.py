from django.urls import path

from .views import CategoryList, ProductDetail, ProductList, WishlistView

urlpatterns = [
    path("products/", ProductList.as_view(), name="product-list"),
    path("products/<int:pk>/", ProductDetail.as_view(), name="product-detail"),
    path("categories/", CategoryList.as_view(), name="category-list"),
    path("wishlist/", WishlistView.as_view(), name="wishlist"),
]
