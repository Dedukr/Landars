from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Order  # Adjust import path
from .models import Product, ProductCategory, Stock
from .serializers import CategorySerializer, ProductSerializer

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
        """Retrieve all products with filtering and sorting."""
        products = Product.objects.all()

        # Filtering
        categories = request.query_params.get("categories")
        if categories:
            category_ids = [int(cid) for cid in categories.split(",") if cid.isdigit()]
            if category_ids:
                products = products.filter(categories__id__in=category_ids).distinct()

        search = request.query_params.get("search")
        if search:
            products = products.filter(name__icontains=search)

        price_min = request.query_params.get("price_min")
        price_max = request.query_params.get("price_max")
        if price_min:
            products = products.filter(price__gte=price_min)
        if price_max:
            products = products.filter(price__lte=price_max)

        in_stock = request.query_params.get("in_stock")
        if in_stock == "1":
            products = products.filter(stock__quantity__gt=0)

        # Sorting
        sort = request.query_params.get("sort")
        if sort == "name_asc":
            products = products.order_by("name")
        elif sort == "name_desc":
            products = products.order_by("-name")
        elif sort == "price_asc":
            products = products.order_by("price")
        elif sort == "price_desc":
            products = products.order_by("-price")
        elif sort == "newest":
            products = products.order_by("-id")
        elif sort == "oldest":
            products = products.order_by("id")
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


class CategoryList(APIView):
    def get(self, request):
        """Retrieve all categories."""
        categories = ProductCategory.objects.all()
        serializer = CategorySerializer(categories, many=True)
        return Response(serializer.data)


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
