from datetime import timedelta

from account.models import CustomUser
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


# ProductCategory model
class ProductCategory(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="subcategories",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Product Categories"
        ordering = ["name"]
        # Ensure categories are ordered by name by default

    def __str__(self):
        # Для удобства отображения в админке
        if self.parent:
            return f"{self.parent.name} → {self.name}"
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
    categories = models.ManyToManyField(ProductCategory, related_name="products")
    price = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)]
    )
    # image = models.ImageField(
    #     upload_to="products/", blank=True, null=True
    # )

    class Meta:
        verbose_name_plural = "Products"
        # Ensure product names are unique within their category
        ordering = ["name"]
        # Ensure products are ordered by category and then by name

    def __str__(self):
        return self.name

    def get_product_details(self):
        return {
            "id": self.id,
            "name": self.name,
            "categories": [cat.name for cat in self.categories.all()],
            "description": self.description,
            "price": str(self.price),
            "image_url": self.image.url if self.image else None,  # Include S3 image URL
        }

    def get_product_stock(self):
        """Get the stock for this product."""
        try:
            stock = self.stock
            return stock.quantity
        except Stock.DoesNotExist:
            return 0

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

        # Автоматично додати батьківські категорії для всіх обраних
        for cat in self.categories.all():
            parent = cat.parent
            while parent:
                self.categories.add(parent)
                parent = parent.parent


# Stock model
class Stock(models.Model):
    product = models.OneToOneField(
        Product, on_delete=models.CASCADE, related_name="stock"
    )
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)

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


# Order model
class Order(models.Model):
    customer = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, related_name="orders", null=True
    )
    notes = models.CharField(max_length=200, blank=True, null=True)
    delivery_date = models.DateField()
    is_home_delivery = models.BooleanField(default=True, verbose_name="Home Delivery")
    delivery_fee = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    order_date = models.DateField(auto_now_add=True, null=True)
    status = models.CharField(
        max_length=50,
        choices=[
            ("pending", "Pending"),
            ("paid", "Paid"),
            ("delivered", "Delivered"),
            ("completed", "Completed"),
            ("cancelled", "Cancelled"),
        ],
        default="pending",
    )
    invoice_link = models.CharField(
        max_length=200, blank=True, null=True
    )  # URL to the invoice PDF

    class Meta:
        verbose_name_plural = "Orders"
        ordering = ["-delivery_date"]
        permissions = [
            ("can_change_status_and_note", "Can change order status and notes"),
        ]

    def __str__(self):
        return f"Order #{self.id} by {self.customer}"

    @property
    def sum_price(self):
        """Calculate the total price of the order."""
        return sum(item.get_total_price() for item in self.items.all())

    @property
    def total_price(self):
        """Calculate the total price of the order including delivery fee."""
        return self.sum_price + self.delivery_fee

    @property
    def due_date(self):
        return self.order_date + timedelta(days=7)

    def get_order_details(self):
        return {
            "order_id": self.id,
            "customer": self.customer,
            "delivery_date": self.delivery_date.strftime("%Y-%m-%d"),
            "total_price": self.get_total_price(),
            "items": [item.get_item_details() for item in self.items.all()],
        }


# OrderItem model
class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    quantity = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0.01)]
    )

    def __str__(self):
        return f"{self.product.name} - {self.quantity}"

    def get_total_price(self):
        return round(self.product.price * self.quantity, 2)

    def get_item_details(self):
        return {
            "product_id": self.product.id,
            "product_name": self.product.name,
            "quantity": self.quantity,
            "total_price": str(self.total_price()),
        }
