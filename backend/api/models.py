from datetime import timedelta

from account.models import CustomUser
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


# ProductCategory model
class ProductCategories(models.Model):
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
        # if self.parent:
        #     return f"{self.parent.name} → {self.name}"
        return self.name

    def get_categories_details(self):
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
        return Product.objects.filter(categories__name=self.name)

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
    categories = models.ManyToManyField(ProductCategories, related_name="products")
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
            # image_url removed since image field is commented out
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
    delivery_date = models.DateField()
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
    created_at = models.DateTimeField(
        auto_now_add=True, help_text="Exact timestamp when order was created"
    )
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

    class Meta:
        verbose_name_plural = "Orders"
        # ordering = ["-delivery_date"]
        # Duplicate prevention is handled at application level with 3-second time window

    def __str__(self):
        return f"Order #{self.id} by {self.customer}"

    @property
    def sum_price(self):
        """Calculate the total items price."""
        result = 0
        for item in self.items.all():
            total_price = item.get_total_price()
            if total_price and total_price != "":
                result += total_price
        return result

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
            "delivery_date": self.delivery_date.strftime("%Y-%m-%d"),
            "total_price": self.total_price,
            "items": [item.get_item_details() for item in self.items.all()],
        }

    @property
    def customer_address(self):
        profile = self.customer.profile if self.customer else None
        if profile and profile.address:
            address = profile.address
            return f"{address.address_line + ', ' if address.address_line else ''}{address.address_line2 + ', ' if address.address_line2 else ''}{address.city + ', ' if address.city else ''}{address.postal_code if address.postal_code else ''}"
        return "No Address"

    def add_item_safely(self, product, quantity):
        """
        Safely add an item to the order, merging quantities if the item already exists.
        Returns the OrderItem instance.
        """
        from django.db import transaction

        with transaction.atomic():
            order_item, created = OrderItem.objects.select_for_update().get_or_create(
                order=self, product=product, defaults={"quantity": quantity}
            )

            if not created:
                # Item already exists, update quantity
                order_item.quantity += quantity
                order_item.save()

            return order_item

    def check_for_duplicate_orders(self, time_window_seconds=3):
        """
        Check if there are orders created by the same user within the time window.
        Returns a list of recent orders from the same customer.
        """
        from datetime import timedelta

        from django.utils import timezone

        if not self.customer:
            return []

        # Get recent orders for the same customer within the time window
        recent_time = timezone.now() - timedelta(seconds=time_window_seconds)
        recent_orders = Order.objects.filter(
            customer=self.customer,
            created_at__gte=recent_time,
        ).exclude(pk=self.pk if self.pk else None)

        return recent_orders

    def calculate_delivery_fee_and_home_status(self):
        """
        Calculate delivery fee and home delivery status based on order items.
        Returns a tuple (is_home_delivery, delivery_fee).
        """
        from decimal import Decimal

        if self.delivery_fee_manual:
            return self.is_home_delivery, self.delivery_fee

        items = self.items.all()
        if not items.exists():
            return True, Decimal("10")

        # Check if any item is NOT in post-suitable category
        post_category = "Sausages and Marinated products"
        has_non_post_items = any(
            item.product
            and post_category.lower()
            not in [
                name.lower()
                for name in item.product.categories.values_list("name", flat=True)
            ]
            for item in items
        )

        if has_non_post_items:
            return True, Decimal("10")  # Home delivery for non-post items

        # All items are post-suitable
        if self.total_price > 220:
            return False, Decimal("0")  # Free delivery for high-value orders

        # Calculate fee based on weight
        total_weight = sum(float(item.quantity) for item in items)
        if total_weight <= 2:
            return False, Decimal("5")
        elif total_weight <= 10:
            return False, Decimal("8")
        else:
            return False, Decimal("15")

    def update_delivery_fee_and_home_status(self):
        """Update delivery fee and home status if not manually set."""
        if not self.delivery_fee_manual:
            is_home_delivery, delivery_fee = (
                self.calculate_delivery_fee_and_home_status()
            )

            if (
                self.is_home_delivery != is_home_delivery
                or self.delivery_fee != delivery_fee
            ):
                self.is_home_delivery = is_home_delivery
                self.delivery_fee = delivery_fee
                self.save(update_fields=["is_home_delivery", "delivery_fee"])


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

    class Meta:
        # Prevent duplicate items in the same order
        unique_together = ("order", "product")
        verbose_name_plural = "Order Items"

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
            "total_price": str(self.get_total_price()),
        }
