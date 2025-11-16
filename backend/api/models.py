from datetime import timedelta

from account.models import CustomUser
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


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
        ordering = ["parent__name", "name"]
        # Ensure categories are ordered by parent name first, then by name

    def __str__(self):
        # if self.parent:
        #     return f"{self.parent.name} → {self.name}"
        return self.name

    def get_category_details(self):
        return {
            "id": self.id,
            "name": self.name,
            "parent": self.parent.name if self.parent else None,
            "subcategories": (
                [sub.name for sub in self.subcategories.all()]
                if self.subcategories.exists()
                else None
            ),
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

    def get_categories(self):
        return [
            cat.name for cat in self.categories.all().order_by("parent__name", "name")
        ]

    def get_product_details(self):
        return {
            "id": self.id,
            "name": self.name,
            "categories": self.get_categories,
            "description": self.description,
            "price": str(self.price),
            "image_url": self.image.url if self.image else None,  # Include S3 image URL
        }

    # def get_product_stock(self):
    #     """Get the stock for this product."""
    #     try:
    #         stock = self.stock
    #         return stock.quantity
    #     except Stock.DoesNotExist:
    #         return 0


# Stock model
# class Stock(models.Model):
#     product = models.OneToOneField(
#         Product, on_delete=models.CASCADE, related_name="stock"
#     )
#     quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)

#     class Meta:
#         verbose_name_plural = "Stock"
#         ordering = ["product"]
#         # Ensure stocks are ordered by product name

#     def __str__(self):
#         return f"{self.product.name} - {self.quantity} in stock"

#     def is_in_stock(self):
#         """Check if the product is in stock."""
#         return self.quantity > 0

#     def reduce_stock(self, quantity):
#         """Reduce stock by a specified quantity."""
#         if quantity <= self.quantity:
#             self.quantity -= quantity
#             self.save()
#         else:
#             raise ValueError("Not enough stock available.")

#     def increase_stock(self, quantity):
#         """Increase stock by a specified quantity."""
#         self.quantity += quantity
#         self.save()


# Order model
class Order(models.Model):
    customer = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, related_name="orders", null=True
    )
    notes = models.CharField(max_length=200, blank=True, null=True)
    delivery_date = models.DateField(null=True, blank=True)
    is_home_delivery = models.BooleanField(default=True, verbose_name="Home Delivery")
    delivery_fee_manual = models.BooleanField(
        default=False,
        help_text="Check to set the delivery fee manually",
    )
    delivery_fee = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    discount = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    order_date = models.DateField(auto_now_add=True, null=True)
    status = models.CharField(
        max_length=50,
        choices=[
            ("pending", "Pending"),
            ("paid", "Paid"),
            ("cancelled", "Cancelled"),
        ],
        default="pending",
    )
    invoice_link = models.CharField(
        max_length=200, blank=True, null=True
    )  # URL to the invoice PDF

    # Stripe payment fields
    payment_intent_id = models.CharField(
        max_length=255, blank=True, null=True, help_text="Stripe Payment Intent ID"
    )
    payment_status = models.CharField(
        max_length=50,
        choices=[
            ("pending", "Pending"),
            ("succeeded", "Succeeded"),
            ("failed", "Failed"),
            ("canceled", "Canceled"),
        ],
        default="pending",
        help_text="Stripe payment status",
    )
    stripe_customer_id = models.CharField(
        max_length=255, blank=True, null=True, help_text="Stripe Customer ID"
    )

    class Meta:
        verbose_name_plural = "Orders"
        ordering = ["-delivery_date"]

    def __str__(self):
        return f"Order #{self.id} by {self.customer}"

    @property
    def sum_price(self):
        """Calculate the total items price."""
        result = 0
        for item in self.items.all():
            if not (item.get_total_price() == ""):
                result += item.get_total_price()
        return result
        # return sum(item.get_total_price() if item.get_total_price() for item in self.items.all())

    @property
    def total_price(self):
        """Calculate the total price of the order including discount and delivery fee."""
        return self.sum_price + self.delivery_fee - self.discount

    @property
    def total_items(self):
        return sum(item.quantity for item in self.items.all())

    @property
    def due_date(self):
        return self.order_date + timedelta(days=7)

    def get_order_details(self):
        return {
            "order_id": self.id,
            "customer": self.customer,
            "delivery_date": (
                self.delivery_date.strftime("%Y-%m-%d") if self.delivery_date else None
            ),
            "total_price": self.get_total_price(),
            "items": [item.get_item_details() for item in self.items.all()],
        }

    @property
    def customer_address(self):
        profile = self.customer.profile if self.customer else None
        if profile and profile.address:
            address = profile.address
            return f"{address.address_line + ', ' if address.address_line else ''}{address.address_line2 + ', ' if address.address_line2 else ''}{address.city + ', ' if address.city else ''}{address.postal_code if address.postal_code else ''}"
        return "No Address"


# OrderItem model
class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
        blank=False,
        null=False,
    )

    def __str__(self):
        return f"{self.product.name if self.product else 'Deleted product'} - {self.quantity}"

    def get_total_price(self):
        return (
            round(self.product.price * self.quantity, 2)
            if self.product and self.quantity
            else ""
        )

    def get_item_details(self):
        return {
            "product_id": self.product.id,
            "product_name": self.product.name,
            "quantity": self.quantity,
            "total_price": str(self.total_price()),
        }


# Wishlist model (similar to Cart)
class Wishlist(models.Model):
    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="wishlist"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Wishlists"

    def __str__(self):
        return f"Wishlist for {self.user.name}"

    @property
    def total_items(self):
        """Calculate the total number of items in the wishlist."""
        return self.items.count()

    def get_wishlist_details(self):
        return {
            "id": self.id,
            "user": self.user.name,
            "total_items": self.total_items,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "items": [item.get_wishlist_item_details() for item in self.items.all()],
        }


# WishlistItem model (similar to CartItem)
class WishlistItem(models.Model):
    wishlist = models.ForeignKey(
        Wishlist, related_name="items", on_delete=models.CASCADE
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    added_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Wishlist Items"
        ordering = ["-added_date"]
        unique_together = [
            "wishlist",
            "product",
        ]  # Prevent duplicate products in wishlist

    def __str__(self):
        return f"{self.product.name} in {self.wishlist.user.name}'s wishlist"

    def get_wishlist_item_details(self):
        return {
            "id": self.id,
            "product_id": self.product.id,
            "product_name": self.product.name,
            "product_price": str(self.product.price),
            "product_description": self.product.description,
            "product_categories": self.product.get_categories(),
            "added_date": self.added_date.isoformat(),
        }


# Cart model
class Cart(models.Model):
    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="cart"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    notes = models.CharField(max_length=200, blank=True, null=True)
    delivery_date = models.DateField(null=True, blank=True)
    is_home_delivery = models.BooleanField(default=True, verbose_name="Home Delivery")
    delivery_fee = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    discount = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )

    class Meta:
        verbose_name_plural = "Carts"

    def __str__(self):
        return f"Cart for {self.user.name}"

    @property
    def sum_price(self):
        """Calculate the total items price (before delivery fee and discount)."""
        return sum(item.get_total_price() for item in self.items.all())

    @property
    def total_price(self):
        """Calculate the total price of the cart including delivery fee and discount."""
        return self.sum_price + self.delivery_fee - self.discount

    @property
    def total_items(self):
        """Calculate the total number of items in the cart."""
        return sum(item.quantity for item in self.items.all())


# CartItem model
class CartItem(models.Model):
    cart = models.ForeignKey(Cart, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
        default=1,
    )
    added_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Cart Items"
        ordering = ["-added_date"]
        unique_together = ["cart", "product"]  # Prevent duplicate products in cart

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"

    def get_total_price(self):
        """Calculate the total price for this cart item."""
        return round(self.product.price * self.quantity, 2)
