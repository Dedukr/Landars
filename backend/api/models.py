from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from account.models import Address, CustomUser
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import (
    MaxValueValidator,
    MinLengthValidator,
    MinValueValidator,
)
from django.db import models
from django.utils import timezone


# ProductCategory model
class ProductCategory(models.Model):
    """
    Flat leaf category. Top-tier grouping/navigation is handled entirely by
    :class:`CategoryGroup` membership — there is no parent/child tree here.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    sold_quantity = models.PositiveIntegerField(
        default=0,
        db_index=True,
        help_text=(
            "Total units sold across products in this category "
            "(sum of order line quantities in paid/ready/issued orders)."
        ),
    )

    class Meta:
        verbose_name_plural = "Product Categories"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def get_category_details(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "sold_quantity": int(self.sold_quantity or 0),
        }

    def get_products(self):
        """Get all products in this category."""
        return Product.objects.filter(categories__name=self.name, active=True)

    def get_product_count(self):
        """Get the count of products in this category."""
        return self.get_products().count()

    def get_product_list(self):
        """Get a list of products in this category."""
        return [product.get_product_details() for product in self.get_products()]


class CategoryGroup(models.Model):
    """Groups multiple product categories for navigation or merchandising."""

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    categories = models.ManyToManyField(
        ProductCategory,
        related_name="category_groups",
        blank=True,
        verbose_name="Child categories",
    )

    class Meta:
        verbose_name = "Category group"
        verbose_name_plural = "Category groups"
        ordering = ["name"]

    def __str__(self):
        return self.name


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
                if settings.R2_PUBLIC_URL and self.image_url.startswith(
                    settings.R2_PUBLIC_URL
                ):
                    # Remove the public URL prefix to get the object key
                    object_key = self.image_url.replace(
                        f"{settings.R2_PUBLIC_URL}/", ""
                    )

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
    active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="If disabled, the product is hidden from the storefront and API listings.",
    )
    categories = models.ManyToManyField(ProductCategory, related_name="products")
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
    vat = models.BooleanField(
        default=False,
        help_text="Check to apply 20% VAT, uncheck for 0% VAT",
    )
    weight = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=1,
        validators=[MinValueValidator(0)],
        help_text="Weight of the product",
    )
    created_at = models.DateTimeField(
        default=timezone.now,
        editable=False,
        db_index=True,
        help_text="When the product was first created (used for newest-first listings).",
    )
    sold_quantity = models.PositiveIntegerField(
        default=0,
        db_index=True,
        help_text="Total units sold (sum of order line quantities in paid/ready/issued orders).",
    )
    sold_orders_count = models.PositiveIntegerField(
        default=0,
        db_index=True,
        help_text="Distinct completed orders containing this product.",
    )
    # image = models.ImageField(
    #     upload_to="products/", blank=True, null=True
    # )

    class Meta:
        verbose_name_plural = "Products"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["-sold_quantity", "id"]),
        ]

    def __str__(self):
        return self.name

    @property
    def price(self):
        """Calculate final price as base_price + holiday_fee."""
        return self.base_price + self.holiday_fee

    @property
    def vat_percentage(self):
        """Return VAT percentage: 20% if VAT is checked, 0% otherwise."""
        return Decimal("0.2") if self.vat else Decimal("0")

    def get_categories(self):
        return [cat.name for cat in self.categories.all().order_by("name")]

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
            "vat": self.vat_percentage,
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


class ProductReview(models.Model):
    """
    Universal review model — works for both products and the general shop/business.

    - Product review: ``product`` FK is set (non-null).
    - Shop review:    ``product`` FK is null.

    The class is intentionally kept as ``ProductReview`` to preserve the existing
    database table (``api_productreview``) and all existing data.
    The ``Review`` alias below lets new code use the cleaner name.
    """

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="reviews",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="product_reviews"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    title = models.CharField(max_length=120, blank=True)
    comment = models.TextField(blank=True)
    is_approved = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Review"
        verbose_name_plural = "Reviews"
        ordering = ["-created_at"]
        constraints = [
            # Enforce one general shop review per user
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(product__isnull=True),
                name="unique_shop_review_per_user",
            )
        ]

    @property
    def is_product_review(self) -> bool:
        return self.product_id is not None

    @property
    def is_shop_review(self) -> bool:
        return self.product_id is None

    def __str__(self):
        if self.product_id:
            product_name = self.product.name if self.product else f"product #{self.product_id}"
            return f"Review by {self.user} for {product_name} ({self.rating}★)"
        return f"Shop review by {self.user} ({self.rating}★)"


# Cleaner alias for new code — same underlying model & table
Review = ProductReview


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


class OrderQuerySet(models.QuerySet):
    """Custom queryset: bulk ``status`` updates refresh denormalised product sales counters."""

    def update(self, **kwargs):
        order_ids: list[int] | None = None
        if "status" in kwargs:
            order_ids = list(self.values_list("pk", flat=True))
        rows = super().update(**kwargs)
        if order_ids:
            from api.services.product_sales import (
                schedule_product_sales_rebuild_for_orders,
            )

            schedule_product_sales_rebuild_for_orders(order_ids)
        return rows


# Order model
class Order(models.Model):
    class Source(models.TextChoices):
        FRONTEND = "frontend", "Frontend"
        ADMIN = "admin", "Admin"
        SYSTEM = "system", "System"

    objects = OrderQuerySet.as_manager()
    source = models.CharField(
        max_length=30,
        choices=Source.choices,
        default=Source.ADMIN,
        db_index=True,
        help_text="Where this order was created (frontend website, admin panel, or system).",
    )
    customer = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, related_name="orders", null=True
    )
    address = models.ForeignKey(
        Address, on_delete=models.SET_NULL, related_name="orders", null=True, blank=True
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
    holiday_fee = models.DecimalField(
        max_digits=3,
        decimal_places=0,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Holiday fee percentage (0-100)",
    )
    created_at = models.DateTimeField(
        auto_now_add=True, help_text="Exact timestamp when order was created"
    )
    status = models.CharField(
        max_length=50,
        choices=[
            ("pending", "Pending"),
            ("paid", "Paid"),
            ("issued", "Issued"),
            ("ready_to_ship", "Ready to ship"),
            ("out_for_delivery", "Out for delivery"),
            ("delivered", "Delivered"),
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
    weight = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
        help_text=(
            "Parcel weight (kg) for Sendcloud: sum(product.weight×qty), min 0.1. "
            "Updated when the order or its lines are saved."
        ),
    )

    def ensure_shipping_details(self):
        """
        Return existing :class:`shipping.models.Shipment` (``related_name=shipping_details``)
        or create a checkout-only row (``status=draft``).
        """
        from django.core.exceptions import ObjectDoesNotExist
        from shipping.models import Shipment

        try:
            return self.shipping_details
        except ObjectDoesNotExist:
            return Shipment.objects.create(
                order=self,
                status=Shipment.Status.DRAFT,
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

        # Total = sum_price + holiday_fee + delivery_fee - discount
        total = (
            self.sum_price + self.holiday_fee_amount + self.delivery_fee - self.discount
        )
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
    def total_weight(self):
        """Calculate the total weight of all items in the order."""
        total = Decimal(0)
        for item in self.items.all():
            # Use product weight if available, otherwise fall back to 0
            if item.product and item.product.weight:
                total += item.product.weight * item.quantity
        return total

    def get_order_details(self):
        return {
            "order_id": self.id,
            "customer": self.customer,
            "delivery_date": self.delivery_date.strftime("%Y-%m-%d"),
            "total_price": self.get_total_price(),
            "items": [item.get_item_details() for item in self.items.all()],
        }

    def get_delivery_address(self):
        """
        Address record used for courier/post shipment: order FK, else profile address.
        Matches the fallback used by :meth:`customer_address` / checkout display.
        """
        if self.address_id:
            return self.address
        if self.customer_id:
            profile = getattr(self.customer, "profile", None)
            if profile and profile.address_id:
                return profile.address
        return None

    @property
    def customer_address(self):
        # Use order's address if it exists, otherwise fall back to customer's profile address
        address = self.get_delivery_address()
        if not address:
            return "No Address"
        return (
            f"{address.address_line + ', ' if address.address_line else ''}"
            f"{address.address_line2 + ', ' if address.address_line2 else ''}"
            f"{address.city + ', ' if address.city else ''}"
            f"{address.postal_code if address.postal_code else ''}"
        )

    def add_item_safely(self, product, quantity):
        """
        Add an item to the order. Raises ValidationError if the item already exists.
        Returns the OrderItem instance.
        """
        from django.db import transaction

        with transaction.atomic():
            # Check if item already exists
            existing_item = (
                OrderItem.objects.select_for_update()
                .filter(order=self, product=product)
                .first()
            )

            if existing_item:
                raise ValidationError(
                    f"Product '{product.name}' already exists in this order. "
                    f"Please update the existing item instead of adding a duplicate."
                )

            # Create new item
            order_item = OrderItem.objects.create(
                order=self, product=product, quantity=quantity
            )

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
        2. Reassign delivery_date_order_id when delivery_date changes
        3. Prevent duplicate orders and ensure proper delivery fee calculation.

        The delivery_date_order_id is calculated atomically using database locks
        to ensure thread-safety in concurrent scenarios.
        """
        from django.db import transaction
        from django.db.models import Max
        from django.utils import timezone

        # Check if delivery_date has changed for existing orders
        old_delivery_date = None
        previous_status = None
        needs_reassignment = False

        if self.pk:
            try:
                old_instance = Order.objects.get(pk=self.pk)
                old_delivery_date = old_instance.delivery_date
                previous_status = old_instance.status
                # Check if delivery_date changed
                if old_delivery_date != self.delivery_date:
                    needs_reassignment = True
            except Order.DoesNotExist:
                # New order, will be handled below
                pass

        if (
            previous_status
            and previous_status != "ready_to_ship"
            and self.status == "ready_to_ship"
        ):
            from django.core.exceptions import ValidationError

            from api.services.order_ready_to_ship import validate_ready_to_ship

            result = validate_ready_to_ship(self)
            if not result.ok:
                raise ValidationError({"status": result.message})

        # Auto-assign or reassign delivery_date_order_id
        # Conditions:
        # 1. New order without delivery_date_order_id
        # 2. Existing order where delivery_date changed
        # 3. Order without delivery_date_order_id (shouldn't happen, but handle it)
        if self.delivery_date:
            if not self.delivery_date_order_id or needs_reassignment:
                with transaction.atomic():
                    # Use select_for_update to lock rows and prevent race conditions
                    # This ensures thread-safety when multiple orders are created
                    # simultaneously for the same delivery_date

                    # Lock all orders with the same delivery_date to prevent concurrent inserts
                    # from getting the same delivery_date_order_id
                    # Exclude current order to avoid locking ourselves
                    locked_orders = (
                        Order.objects.filter(delivery_date=self.delivery_date)
                        .exclude(pk=self.pk if self.pk else None)
                        .select_for_update()
                    )

                    # Get the maximum delivery_date_order_id for this delivery_date
                    # This query runs within the locked transaction
                    max_order = locked_orders.aggregate(
                        max_id=Max("delivery_date_order_id")
                    )
                    max_id = max_order["max_id"]

                    # If no orders exist for this delivery_date, start at 1
                    # Otherwise, increment by 1
                    self.delivery_date_order_id = (max_id + 1) if max_id else 1
        else:
            # No delivery_date, clear the order_id
            self.delivery_date_order_id = None

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
        self.refresh_weight()

    def refresh_weight(self) -> None:
        """Recompute and persist :meth:`weight` from current lines."""
        if not self.pk:
            return
        from shipping.sendcloud_shipping import ShippingService

        items = list(self.items.select_related("product").all())
        if not items:
            Order.objects.filter(pk=self.pk).update(weight=None)
            self.weight = None
            return
        w = max(ShippingService.parcel_weight_kg_from_line_items(items), 0.1)
        dec = Decimal(str(w)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        Order.objects.filter(pk=self.pk).update(weight=dec)
        self.weight = dec

    def calculate_delivery_fee_and_home_status(self):
        """
        Calculate delivery fee and home delivery status based on order items.
        Returns a tuple (is_home_delivery, delivery_fee).
        Uses Royal Mail pricing for post-delivery group categories (same as cart).
        """
        from decimal import Decimal

        from api.services.post_delivery_categories import (
            product_has_post_delivery_category,
        )

        if self.delivery_fee_manual:
            return self.is_home_delivery, self.delivery_fee

        items = self.items.select_related("product").all()
        if not items.exists():
            return True, Decimal("10")

        has_non_post_items = any(
            item.product and not product_has_post_delivery_category(item.product)
            for item in items
        )

        if has_non_post_items:
            return True, Decimal("10")  # Home delivery for non-post items

        # All items are post-suitable — use merchandise only (exclude delivery_fee).
        merch = Decimal(0)
        for item in items:
            tp = item.get_total_price()
            if tp != "":
                merch += Decimal(str(tp))
        if merch > Decimal("200"):
            return False, Decimal("0")  # Free delivery for high-value orders

        from shipping.sendcloud_shipping import ShippingService

        total_weight = ShippingService.parcel_weight_kg_from_line_items(items)
        addr = self.get_delivery_address()
        postal = (addr.postal_code or "").strip() if addr else ""
        delivery_fee = ShippingService.get_delivery_fee_by_weight(
            total_weight,
            to_country="GB",
            to_postal_code=postal or None,
        )
        return False, delivery_fee

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

        from api.services.post_delivery_categories import (
            product_has_post_delivery_category,
        )

        has_non_post_items = any(
            prod and not product_has_post_delivery_category(prod)
            for prod, _ in normalized
        )
        if has_non_post_items:
            return True, Decimal("10")

        # Merchandise subtotal for free delivery (catalog × qty). Optional ``line_total``
        # per row (from admin) uses snapshot line totals when all contributing rows set it.
        line_merch = Decimal(0)
        n_line = 0
        for raw in items_data or []:
            product = raw.get("product")
            quantity = raw.get("quantity")
            if not product or not quantity:
                continue
            lt = raw.get("line_total")
            if lt not in (None, ""):
                line_merch += Decimal(str(lt))
                n_line += 1
        n_in = sum(
            1 for raw in items_data or [] if raw.get("product") and raw.get("quantity")
        )
        if n_line > 0 and n_line == n_in:
            merch = line_merch
        else:
            merch = sum(
                (prod.price * Decimal(str(q))) for prod, q in normalized if prod
            )
        if merch > Decimal("200"):
            return False, Decimal("0")

        from shipping.sendcloud_shipping import ShippingService

        total_weight = ShippingService.parcel_weight_kg_from_product_qty_pairs(
            normalized
        )
        delivery_fee = ShippingService.get_delivery_fee_by_weight(
            total_weight,
            to_country=None,
            to_postal_code=None,
        )
        return False, delivery_fee

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
        validators=[MinValueValidator(Decimal("0.01"))],
        blank=False,
        null=False,
    )
    # Historical data fields - store item information at time of purchase
    item_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Stored item name at time of purchase (preserved if product is deleted)",
    )
    item_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True,
        validators=[MinValueValidator(0)],
        help_text="Stored item price at time of purchase (preserved if product is deleted)",
    )

    class Meta:
        verbose_name_plural = "Order Items"

    def __str__(self):
        name = (
            self.item_name
            if self.item_name
            else (self.product.name if self.product else "Deleted product")
        )
        return f"{name} - {self.quantity}"

    def save(self, *args, **kwargs):
        """
        Automatically populate item_name and item_price snapshots from product.
        Only populates if snapshots are empty (fallback for programmatic creation).

        Note: When saving through admin form, the form's save() method handles
        snapshot updates. This method only acts as a fallback.
        """
        # Only populate snapshots if they're empty (fallback for non-form saves)
        if self.product:
            if not self.item_name:
                self.item_name = self.product.name
            if self.item_price is None:
                self.item_price = self.product.price

        super().save(*args, **kwargs)
        if self.order_id:
            Order.objects.get(pk=self.order_id).refresh_weight()

    def delete(self, *args, **kwargs):
        oid = self.order_id
        super().delete(*args, **kwargs)
        if oid:
            o = Order.objects.filter(pk=oid).first()
            if o:
                o.refresh_weight()

    def get_total_price(self):
        """
        Calculate total price using the price at time of order (item_price snapshot).
        Only falls back to current product.price when item_price was never set (legacy data).
        """
        if not self.quantity:
            return ""

        # Prefer snapshot price whenever available so order/invoice totals stay consistent
        price = (
            self.item_price
            if self.item_price is not None
            else (self.product.price if self.product else None)
        )

        if price is None:
            return ""

        return round(price * self.quantity, 2)

    def get_item_details(self):
        """
        Return item details using stored information when product is deleted.
        """
        product_id = self.product.id if self.product else None
        product_name = (
            self.item_name
            if self.item_name
            else (self.product.name if self.product else "Deleted product")
        )

        return {
            "product_id": product_id,
            "product_name": product_name,
            "quantity": self.quantity,
            "total_price": str(self.get_total_price()),
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

    @property
    def total_weight(self):
        """Calculate the total weight of all items in the cart."""
        total = Decimal(0)
        for item in self.items.all():
            if item.product and item.product.weight:
                total += item.product.weight * item.quantity
        return total


# CartItem model
class CartItem(models.Model):
    cart = models.ForeignKey(Cart, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
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
