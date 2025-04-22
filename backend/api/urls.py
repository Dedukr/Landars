from django.urls import path
from . import views
from .views import ProductList, ProductDetail

urlpatterns = [
    path('products/', ProductList.as_view(), name='product-list'),
    path('products/<int:product_id>/', ProductDetail.as_view(), name='product-detail'),
]