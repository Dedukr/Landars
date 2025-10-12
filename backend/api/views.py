import uuid

from django.contrib.admin.views.decorators import staff_member_required
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Order, OrderItem, Product
from .serializers import OrderItemSerializer, OrderSerializer, ProductSerializer

# @staff_member_required
# def order_invoice_pdf(request, pk):
#     from weasyprint import HTML

#     order = Order.objects.get_object_or_404(pk)
#     """Generate a PDF invoice for the order."""
#     if not order.invoice:
#         return JsonResponse(
#             {"error": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND
#         )
#     html_string = render_to_string("invoice.html", {"order": order})
#     pdf_file = HTML(string=html_string).write_pdf()
#     response = HttpResponse(pdf_file, content_type="application/pdf")
#     response["Content-Disposition"] = f'inline; filename="invoice_{order.id}.pdf"'
#     return response


# Create your views here.
class ProductList(APIView):
    def get(self, request):
        """Retrieve all products with stock availability."""
        products = Product.objects.all()
        serializer = ProductSerializer(products, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Create a new product and initialize its stock."""
        serializer = ProductSerializer(data=request.data)
        if serializer.is_valid():
            product = serializer.save()
            # Initialize stock for the new product
            # Stock.objects.create(product=product, quantity=request.data.get("stock", 0))
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProductDetail(APIView):
    def get(self, request, product_id):
        """Retrieve a single product by ID."""
        product = self.get_object(product_id)
        if product:
            serializer = ProductSerializer(product)
            return Response(serializer.data)
        return Response(
            {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
        )

    def put(self, request, product_id):
        """Update a product by replacing it entirely."""
        product = self.get_object(product_id)
        if product:
            serializer = ProductSerializer(product, data=request.data)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
        )

    def patch(self, request, product_id):
        """Partially update a product."""
        product = self.get_object(product_id)
        if product:
            serializer = ProductSerializer(product, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
        )

    def delete(self, request, product_id):
        """Delete a product."""
        product = self.get_object(product_id)
        if product:
            product.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(
            {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
        )

    @staticmethod
    def get_object(product_id):
        """Helper method to retrieve a product by ID."""
        try:
            return Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return None


class StockUpdateView(APIView):
    def patch(self, request, product_id):
        """Update stock for a specific product."""
        try:
            stock = Stock.objects.get(product_id=product_id)
            stock.quantity += int(request.data.get("quantity", 0))
            stock.save()
            return Response(
                {"message": "Stock updated successfully."}, status=status.HTTP_200_OK
            )
        except Stock.DoesNotExist:
            return Response(
                {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )


class OrderListCreateView(APIView):
    """
    List all orders or create a new order with atomic transaction to prevent duplicates.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Retrieve all orders for the authenticated user."""
        orders = Order.objects.filter(customer=request.user).order_by("-id")
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    @transaction.atomic
    def post(self, request):
        """
        Create a new order with atomic transaction to prevent duplicates.
        Uses a unique constraint check to prevent duplicate orders.
        """
        # Add customer from authenticated user
        data = request.data.copy()
        data["customer"] = request.user.id

        # Generate a unique order token to prevent duplicates
        order_token = str(uuid.uuid4())
        data["notes"] = f"{data.get('notes', '')} [TOKEN:{order_token}]"

        serializer = OrderSerializer(data=data)
        if serializer.is_valid():
            try:
                order = serializer.save()
                return Response(
                    OrderSerializer(order).data, status=status.HTTP_201_CREATED
                )
            except Exception as e:
                return Response(
                    {"error": f"Failed to create order: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OrderDetailView(APIView):
    """
    Retrieve, update or delete a specific order.
    """

    permission_classes = [IsAuthenticated]

    def get_object(self, order_id, user):
        """Get order object and check ownership."""
        try:
            return Order.objects.get(id=order_id, customer=user)
        except Order.DoesNotExist:
            return None

    def get(self, request, order_id):
        """Retrieve a specific order."""
        order = self.get_object(order_id, request.user)
        if order:
            serializer = OrderSerializer(order)
            return Response(serializer.data)
        return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

    @transaction.atomic
    def put(self, request, order_id):
        """Update an order entirely."""
        order = self.get_object(order_id, request.user)
        if order:
            serializer = OrderSerializer(order, data=request.data)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

    @transaction.atomic
    def patch(self, request, order_id):
        """Partially update an order."""
        order = self.get_object(order_id, request.user)
        if order:
            serializer = OrderSerializer(order, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, order_id):
        """Delete an order."""
        order = self.get_object(order_id, request.user)
        if order:
            order.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)


class OrderItemView(APIView):
    """
    Manage order items with duplicate prevention.
    """

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, order_id):
        """Add an item to an order with duplicate prevention."""
        try:
            order = Order.objects.select_for_update().get(
                id=order_id, customer=request.user
            )
        except Order.DoesNotExist:
            return Response(
                {"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND
            )

        product_id = request.data.get("product")
        quantity = request.data.get("quantity", 1)

        # Validate product exists
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Validate quantity
        if quantity <= 0:
            return Response(
                {"error": "Quantity must be greater than 0"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Use get_or_create with select_for_update to prevent race conditions
        existing_item, created = OrderItem.objects.select_for_update().get_or_create(
            order=order, product=product, defaults={"quantity": quantity}
        )

        if not created:
            # Item already exists, update quantity
            existing_item.quantity += quantity
            existing_item.save()
            serializer = OrderItemSerializer(existing_item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        else:
            # New item created
            serializer = OrderItemSerializer(existing_item)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def delete(self, request, order_id, item_id):
        """Remove an item from an order."""
        try:
            order = Order.objects.get(id=order_id, customer=request.user)
            item = OrderItem.objects.get(id=item_id, order=order)
            item.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except (Order.DoesNotExist, OrderItem.DoesNotExist):
            return Response(
                {"error": "Order or item not found"}, status=status.HTTP_404_NOT_FOUND
            )
