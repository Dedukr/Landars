import uuid

from django.conf import settings
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

from .models import Order, OrderItem, Product, ProductImage
from .r2_storage import (
    generate_presigned_upload_url,
    generate_unique_object_key,
    upload_compressed_image_to_r2,
    validate_image_size,
    validate_image_type,
)
from .validators import validate_image_file_extension
from .serializers import (
    OrderItemSerializer,
    OrderSerializer,
    ProductListSerializer,
    ProductSerializer,
)

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
        """Retrieve all products with only primary images."""
        products = Product.objects.prefetch_related("images").all()
        serializer = ProductListSerializer(products, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Create a new product with images."""
        serializer = ProductSerializer(data=request.data)
        if serializer.is_valid():
            product = serializer.save()
            return Response(
                ProductSerializer(product).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProductDetail(APIView):
    def get(self, request, product_id):
        """Retrieve a single product by ID with all images."""
        product = self.get_object(product_id)
        if product:
            serializer = ProductSerializer(product)
            return Response(serializer.data)
        return Response(
            {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
        )

    def put(self, request, product_id):
        """Update a product by replacing it entirely, including images."""
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
        """Partially update a product. If images are included, they replace all existing images."""
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
        """Delete a product and all its images."""
        product = self.get_object(product_id)
        if product:
            # Images are automatically deleted via CASCADE
            product.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(
            {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
        )

    @staticmethod
    def get_object(product_id):
        """Helper method to retrieve a product by ID with images prefetched."""
        try:
            return Product.objects.prefetch_related("images").get(id=product_id)
        except Product.DoesNotExist:
            return None


# StockUpdateView removed - Stock model was deleted


class OrderListCreateView(APIView):
    """List all orders or create a new order."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Retrieve all orders for the authenticated user."""
        orders = Order.objects.filter(customer=request.user).order_by("-id")
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Create a new order."""
        # Add customer from authenticated user
        data = request.data.copy()
        data["customer"] = request.user.id

        serializer = OrderSerializer(data=data)
        if serializer.is_valid():
            try:
                # Create the order
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
    """Manage order items."""

    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        """Add an item to an order."""
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

        # Use the safe method that handles duplicates by merging quantities
        item = order.add_item_safely(product, quantity)
        serializer = OrderItemSerializer(item)
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


class PresignedUploadView(APIView):
    """
    Generate presigned URLs for uploading product images to Cloudflare R2.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Generate a presigned URL for uploading an image.
        
        Request body:
        {
            "filename": "image.jpg",
            "content_type": "image/jpeg",
            "product_id": 123  // optional
            "file_size": 1024000  // optional, in bytes
        }
        
        Response:
        {
            "presigned_url": "https://...",
            "public_url": "https://...",
            "object_key": "products/...",
            "required_headers": {
                "Content-Type": "image/jpeg"
            }
        }
        """
        filename = request.data.get("filename")
        content_type = request.data.get("content_type")
        product_id = request.data.get("product_id")
        file_size = request.data.get("file_size")

        # Validation
        if not filename:
            return Response(
                {"error": "filename is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not content_type:
            return Response(
                {"error": "content_type is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate file extension
        try:
            validate_image_file_extension(filename)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate image type
        if not validate_image_type(content_type):
            return Response(
                {
                    "error": f"Invalid image type. Allowed types: {', '.join(settings.ALLOWED_IMAGE_TYPES)}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate file size if provided
        if file_size and not validate_image_size(file_size):
            max_size_mb = settings.MAX_IMAGE_SIZE / (1024 * 1024)
            return Response(
                {"error": f"File size exceeds maximum allowed size of {max_size_mb}MB"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate product exists if product_id is provided
        if product_id:
            try:
                Product.objects.get(id=product_id)
            except Product.DoesNotExist:
                return Response(
                    {"error": "Product not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        try:
            # Generate unique object key
            object_key = generate_unique_object_key(filename, product_id)

            # Generate presigned URL
            upload_data = generate_presigned_upload_url(object_key, content_type)

            return Response(upload_data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": f"Failed to generate presigned URL: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CompressedImageUploadView(APIView):
    """
    Direct image upload endpoint with automatic compression.
    Accepts multipart/form-data file uploads, compresses them, and uploads to R2.
    Requires authentication.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Upload and compress an image file.
        
        Request:
        - multipart/form-data with 'image' field containing the file
        - Optional 'product_id' field
        - Optional 'max_width' field (default: 1920)
        - Optional 'max_height' field (default: 1920)
        - Optional 'quality' field (default: 85, range: 1-100)
        
        Response:
        {
            "public_url": "https://...",
            "object_key": "products/...",
            "content_type": "image/jpeg",
            "original_size": 1024000,
            "compressed_size": 256000,
            "compression_ratio": 75.0
        }
        """
        # Check if image file is provided
        if 'image' not in request.FILES:
            return Response(
                {"error": "No image file provided. Use 'image' field in multipart/form-data."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        image_file = request.FILES['image']
        filename = image_file.name
        
        # Validate file extension
        try:
            validate_image_file_extension(filename)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        # Validate content type
        content_type = image_file.content_type
        if not validate_image_type(content_type):
            return Response(
                {
                    "error": f"Invalid image type. Allowed types: {', '.join(settings.ALLOWED_IMAGE_TYPES)}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        # Validate file size
        if not validate_image_size(image_file.size):
            max_size_mb = settings.MAX_IMAGE_SIZE / (1024 * 1024)
            return Response(
                {"error": f"File size exceeds maximum allowed size of {max_size_mb}MB"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        # Get optional parameters
        product_id = request.data.get('product_id')
        if product_id:
            try:
                product_id = int(product_id)
                # Validate product exists
                Product.objects.get(id=product_id)
            except (ValueError, Product.DoesNotExist):
                return Response(
                    {"error": "Invalid product_id"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            product_id = None
        
        # Get compression parameters
        try:
            max_width = int(request.data.get('max_width', 1920))
            max_height = int(request.data.get('max_height', 1920))
            quality = int(request.data.get('quality', 85))
            
            # Validate quality range
            if quality < 1 or quality > 100:
                return Response(
                    {"error": "Quality must be between 1 and 100"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except ValueError:
            return Response(
                {"error": "Invalid compression parameters. max_width, max_height, and quality must be integers."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        try:
            # Read file content
            image_file.seek(0)
            file_content = image_file.read()
            
            # Compress and upload to R2
            upload_result = upload_compressed_image_to_r2(
                file_content,
                filename,
                product_id=product_id,
                max_width=max_width,
                max_height=max_height,
                quality=quality,
            )
            
            return Response(upload_result, status=status.HTTP_201_CREATED)
        
        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to upload image: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
