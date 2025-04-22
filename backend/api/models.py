from django.db import models


# Product model
class Product(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return self.name

    def get_product_details(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": str(self.price),
        }


# Stock model
class Stock(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.product.name} - {self.quantity} in stock"

    def is_in_stock(self):
        return self.quantity > 0

    def reduce_stock(self, quantity):
        if quantity <= self.quantity:
            self.quantity -= quantity
            self.save()
        else:
            raise ValueError("Not enough stock available.")


# Order model
class Order(models.Model):
    customer_name = models.CharField(max_length=255)
    order_date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Order #{self.id} by {self.customer_name}"

    def get_total_price(self):
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
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.quantity} x {self.product.name} (Order #{self.order.id})"

    def save(self, *args, **kwargs):
        """Override save to reduce stock when an order item is created."""
        if not self.pk:  # Only reduce stock on creation
            stock = Stock.objects.get(product=self.product)
            if stock.quantity >= self.quantity:
                stock.reduce_stock(self.quantity)
            else:
                raise ValueError("Not enough stock available.")
        super().save(*args, **kwargs)

    def get_total_price(self):
        return self.product.price * self.quantity

    def get_item_details(self):
        return {
            "product_id": self.product.id,
            "product_name": self.product.name,
            "product_price": self.product.price,
            "quantity": self.quantity,
            "total_price": self.get_total_price(),
        }
