from account.models import CustomUser
from django.contrib.auth.models import AbstractUser
from django.db import models


# ProductCategory model
class ProductCategory(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name_plural = "Product Categories"
        ordering = ["name"]
        # Ensure categories are ordered by name by default

    def __str__(self):
        return self.name

    def get_category_details(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
        }

    def get_products(self):
        """Get all products in this category."""
        return Product.objects.filter(category=self.name)

    def get_product_count(self):
        """Get the count of products in this category."""
        return self.get_products().count()

    def get_product_list(self):
        """Get a list of products in this category."""
        return [product.get_product_details() for product in self.get_products()]


# Product model
class Product(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    category = models.ForeignKey(
        ProductCategory, on_delete=models.CASCADE, related_name="products"
    )
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image = models.ImageField(upload_to="products/", blank=True, null=True)

    class Meta:
        verbose_name_plural = "Products"
        unique_together = ("name", "category")
        # Ensure product names are unique within their category
        ordering = ["category", "name"]
        # Ensure products are ordered by category and then by name

    def __str__(self):
        return self.name

    def get_product_details(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": str(self.price),
            "image_url": self.image.url if self.image else None,  # Include S3 image URL
        }


# Stock model
class Stock(models.Model):
    product = models.OneToOneField(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()

    class Meta:
        verbose_name_plural = "Stock"
        ordering = ["product"]
        # Ensure stocks are ordered by product name

    def __str__(self):
        return f"{self.product.name} - {self.quantity} in stock"

    def is_in_stock(self):
        """Check if the product is in stock."""
        return self.quantity > 0

    def reduce_stock(self, quantity):
        """Reduce stock by a specified quantity."""
        if quantity <= self.quantity:
            self.quantity -= quantity
            self.save()
        else:
            raise ValueError("Not enough stock available.")

    def increase_stock(self, quantity):
        """Increase stock by a specified quantity."""
        self.quantity += quantity
        self.save()

