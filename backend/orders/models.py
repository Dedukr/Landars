from django.db import models
from account.models import CustomUser
from api.models import Product

# Create your models here.


# Order model
class Order(models.Model):
    customer = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, related_name="orders", null=True
    )
    notes = models.TextField(blank=True, null=True)
    order_date = models.DateTimeField(auto_now_add=True)
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

    class Meta:
        verbose_name_plural = "Orders"
        ordering = ["-order_date"]
        # Ensure orders are ordered by order date (latest first)

    def __str__(self):
        return f"Order #{self.id} by {self.customer_name}"

    @property
    def total_price(self):
        return sum(item.get_total_price() for item in self.items.all())

    def get_order_details(self):
        return {
            "order_id": self.id,
            "customer_name": self.customer_name,
            "order_date": self.order_date.strftime("%Y-%m-%d %H:%M:%S"),
            "total_price": self.get_total_price(),
            "items": [item.get_item_details() for item in self.items.all()],
        }


# OrderItem model
class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    product_name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.product.name} - {self.quantity}"

    @property
    def total_price(self):
        return self.product.price * self.quantity

    def get_item_details(self):
        return {
            "product_id": self.product.id,
            "product_name": self.product.name,
            "quantity": self.quantity,
            "total_price": str(self.get_total_price()),
        }
