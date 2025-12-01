from datetime import timedelta

from account.models import CustomUser
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator, MinLengthValidator
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


# ProductImage model
class ProductImage(models.Model):
    product = models.ForeignKey(
        "Product", related_name="images", on_delete=models.CASCADE
    )
    image_url = models.URLField(max_length=500)
    sort_order = models.PositiveIntegerField(default=0)
    alt_text = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Product Images"
        ordering = ["sort_order", "created_at"]
        indexes = [
            models.Index(fields=["product", "sort_order"]),
        ]

    def __str__(self):
        primary_text = " (Primary)" if self.sort_order == 0 else ""
        return f"{self.product.name} - Image {self.sort_order}{primary_text}"
    
    @property
    def is_primary(self):
        """The first image (sort_order=0 or lowest) is always the primary image."""
        first_image = self.product.images.first()
        return first_image and first_image.id == self.id
    
    def delete(self, *args, **kwargs):
        """
        Override delete to also remove the image from R2 storage.
        """
        # Extract object key from image URL and delete from R2
        if self.image_url:
            try:
                from django.conf import settings
                from .r2_storage import delete_image_from_r2
                
                # Extract the object key from the URL
                # URL format: https://cdn.example.com/products/123/timestamp_uuid_filename.jpg
                # We need: products/123/timestamp_uuid_filename.jpg
                if settings.R2_PUBLIC_URL and self.image_url.startswith(settings.R2_PUBLIC_URL):
                    # Remove the public URL prefix to get the object key
                    object_key = self.image_url.replace(f"{settings.R2_PUBLIC_URL}/", "")
                    
                    # Delete from R2
                    deleted = delete_image_from_r2(object_key)
                    if deleted:
                        print(f"Successfully deleted image from R2: {object_key}")
                    else:
                        print(f"Failed to delete image from R2: {object_key}")
            except Exception as e:
                # Don't fail the delete operation if R2 deletion fails
                print(f"Error deleting image from R2: {e}")
        
        # Call the parent delete method
        super().delete(*args, **kwargs)


# Product model
class Product(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    categories = models.ManyToManyField(ProductCategories, related_name="products")
    base_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Base price of the product",
    )
    holiday_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Additional holiday fee applied to the product",
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

    @property
    def price(self):
        """Calculate final price as base_price + holiday_fee."""
        return self.base_price + self.holiday_fee

    def get_categories(self):
        return [
            cat.name for cat in self.categories.all().order_by("parent__name", "name")
        ]

    def get_product_details(self):
        primary_image = self.images.first()  # First image is always primary
        return {
            "id": self.id,
            "name": self.name,
            "categories": self.get_categories,
            "description": self.description,
            "base_price": str(self.base_price),
            "holiday_fee": str(self.holiday_fee),
            "price": str(self.price),
            "primary_image": primary_image.image_url if primary_image else None,
        }
    
    def get_primary_image(self):
        """Get the primary image URL or None. The first image (by sort_order) is always primary."""
        first_image = self.images.first()
        return first_image.image_url if first_image else None

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
    holiday_fee = models.DecimalField(
        max_digits=3,
        decimal_places=0,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Holiday fee percentage (0-100)",
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
    delivery_date_order_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="Order ID",
        help_text="Auto-incrementing order ID per delivery date (starts at 1 for each date)",
    )

    class Meta:
        verbose_name_plural = "Orders"
        # ordering = ["-delivery_date"]
        # Duplicate-prevention removed
        indexes = [
            models.Index(
                fields=["delivery_date", "delivery_date_order_id"],
                name="order_delivery_date_id_idx",
            ),
        ]

    def __str__(self):
        if self.delivery_date_order_id:
            return f"Order #{self.delivery_date_order_id} ({self.delivery_date}) by {self.customer}"
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
        """Calculate the total price of the order including holiday fee, discount and delivery fee."""
        from decimal import Decimal

        # Calculate holiday fee amount as percentage of sum_price
        holiday_fee_amount = self.sum_price * (self.holiday_fee / Decimal("100"))
        # Total = sum_price + holiday_fee + delivery_fee - discount
        total = self.sum_price + holiday_fee_amount + self.delivery_fee - self.discount
        # Round to 2 decimal places (consistent with OrderItem.get_total_price pattern)
        return round(total, 2)

    @property
    def holiday_fee_amount(self):
        """Calculate the actual holiday fee amount based on percentage."""
        from decimal import Decimal

        return self.sum_price * (self.holiday_fee / Decimal("100"))

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

    def save(self, *args, **kwargs):
        """
        Override save to:
        1. Auto-assign delivery_date_order_id (per delivery_date auto-increment)
        2. Prevent duplicate orders and ensure proper delivery fee calculation.

        The delivery_date_order_id is calculated atomically using database locks
        to ensure thread-safety in concurrent scenarios.
        """
        from django.db import transaction
        from django.utils import timezone

        # Auto-assign delivery_date_order_id for orders without one
        # Assign for both new orders and existing orders that don't have it set
        if self.delivery_date and not self.delivery_date_order_id:
            with transaction.atomic():
                # Use select_for_update to lock rows and prevent race conditions
                # This ensures thread-safety when multiple orders are created
                # simultaneously for the same delivery_date
                from django.db.models import Max

                # Lock all orders with the same delivery_date to prevent concurrent inserts
                # from getting the same delivery_date_order_id
                locked_orders = Order.objects.filter(
                    delivery_date=self.delivery_date
                ).select_for_update()

                # Get the maximum delivery_date_order_id for this delivery_date
                # This query runs within the locked transaction
                max_order = locked_orders.aggregate(
                    max_id=Max("delivery_date_order_id")
                )
                max_id = max_order["max_id"]

                # If no orders exist for this delivery_date, start at 1
                # Otherwise, increment by 1
                self.delivery_date_order_id = (max_id + 1) if max_id else 1

        # Check for potential duplicates before saving
        if not self.pk and self.customer:
            recent_orders = self.check_for_duplicate_orders()
            if recent_orders.exists():
                # Log the potential duplicate but don't prevent save
                # This is just for monitoring purposes
                print(
                    f"Warning: Potential duplicate order detected for customer {self.customer}"
                )

        # Call parent save
        super().save(*args, **kwargs)

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

    def calculate_delivery_fee_and_home_status_from_items(self, items_data):
        """
        Calculate delivery fee and home delivery status using a list of items
        that may not yet be persisted. Each item in items_data must include
        keys: "product" (Product instance or id) and "quantity" (Decimal/float).
        """
        from decimal import Decimal

        if self.delivery_fee_manual:
            return self.is_home_delivery, self.delivery_fee

        # Normalize items to (Product instance, quantity)
        product_ids = []
        normalized = []
        for item in items_data or []:
            product = item.get("product")
            quantity = item.get("quantity")
            if not product or not quantity:
                continue
            if isinstance(product, int):
                product_ids.append(product)
                normalized.append((product, quantity))
            else:
                normalized.append((product, quantity))

        # Fetch missing Product instances in bulk
        if product_ids:
            from .models import Product as ProductModel

            id_to_product = {
                p.id: p for p in ProductModel.objects.filter(id__in=product_ids)
            }
            normalized = [
                (id_to_product.get(p) if isinstance(p, int) else p, q)
                for p, q in normalized
                if (id_to_product.get(p) if isinstance(p, int) else p) is not None
            ]

        if not normalized:
            return True, Decimal("10")

        # Determine if any item is not in the post-suitable category
        post_category = "Sausages and Marinated products"
        has_non_post_items = any(
            prod
            and post_category.lower()
            not in [
                name.lower() for name in prod.categories.values_list("name", flat=True)
            ]
            for prod, _ in normalized
        )
        if has_non_post_items:
            return True, Decimal("10")

        # All items are post-suitable. Compute total price and weight.
        total_price = sum((prod.price * q) for prod, q in normalized if prod)
        if total_price > Decimal("220"):
            return False, Decimal("0")

        total_weight = sum(float(q) for _, q in normalized)
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
        verbose_name_plural = "Order Items"
        unique_together = ("order", "product")

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
