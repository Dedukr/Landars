from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from .models import (
    Cart,
    CartItem,
    Order,
    Product,
    ProductCategory,
    Wishlist,
    WishlistItem,
)
from .serializers import (
    CartItemSerializer,
    CartSerializer,
    CategorySerializer,
    ProductSerializer,
    WishlistItemSerializer,
    WishlistSerializer,
)


# Custom throttle for categories - more permissive since it's read-only
class CategoryThrottle(AnonRateThrottle):
    rate = "2000/hour"  # Very permissive for read-only categories


class CategoryUserThrottle(UserRateThrottle):
    rate = "10000/hour"  # Very permissive for authenticated users


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
    permission_classes = [AllowAny]  # Allow unauthenticated access to view products

    def get(self, request):
        """Retrieve products with filtering, sorting, and pagination."""
        # Create cache key based on query parameters
        cache_key = f"products_{hash(str(request.query_params))}"

        # Try to get cached response
        cached_response = cache.get(cache_key)
        if cached_response:
            return Response(cached_response)

        # Optimize database queries with select_related and prefetch_related
        products = Product.objects.select_related().prefetch_related("categories").all()

        # Filtering
        categories = request.query_params.get("categories")
        if categories:
            category_ids = [int(cid) for cid in categories.split(",") if cid.isdigit()]
            if category_ids:
                products = products.filter(categories__id__in=category_ids).distinct()

        # Support single category parameter for backward compatibility
        category = request.query_params.get("category")
        if category and category.isdigit():
            products = products.filter(categories__id=int(category)).distinct()

        # Exclude specific products
        exclude = request.query_params.get("exclude")
        if exclude:
            exclude_ids = [int(pid) for pid in exclude.split(",") if pid.isdigit()]
            if exclude_ids:
                products = products.exclude(id__in=exclude_ids)

        search = request.query_params.get("search")
        if search:
            products = products.filter(name__icontains=search)

        price_min = request.query_params.get("price_min")
        price_max = request.query_params.get("price_max")
        if price_min:
            products = products.filter(price__gte=price_min)
        if price_max:
            products = products.filter(price__lte=price_max)

        # Stock filtering is disabled since Stock model is commented out
        # in_stock = request.query_params.get("in_stock")
        # if in_stock == "1":
        #     products = products.filter(stock__quantity__gt=0)

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

        # Get total count before pagination
        total_count = products.count()

        # Pagination
        limit = int(
            request.query_params.get("limit", 50)
        )  # Default to 50 items per page
        offset = int(
            request.query_params.get("offset", 0)
        )  # Default to start from beginning

        # Apply pagination
        products = products[offset : offset + limit]

        serializer = ProductSerializer(products, many=True)

        # Prepare response data
        response_data = {
            "results": serializer.data,
            "count": total_count,
            "next": (
                f"?limit={limit}&offset={offset + limit}"
                if offset + limit < total_count
                else None
            ),
            "previous": (
                f"?limit={limit}&offset={max(0, offset - limit)}"
                if offset > 0
                else None
            ),
            "limit": limit,
            "offset": offset,
        }

        # Cache the response for 5 minutes
        cache.set(cache_key, response_data, 300)

        # Return paginated response
        return Response(response_data)

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
    permission_classes = [
        AllowAny
    ]  # Allow unauthenticated access to view product details

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
    permission_classes = [AllowAny]  # Allow unauthenticated access to view categories
    throttle_classes = []  # Disable throttling for categories endpoint

    def get(self, request):
        """Retrieve all categories."""
        # Use cache to reduce database load
        cache_key = "categories_list"
        cached_response = cache.get(cache_key)
        if cached_response:
            return Response(cached_response)

        categories = ProductCategory.objects.all()
        serializer = CategorySerializer(categories, many=True)
        response_data = serializer.data

        # Cache for 1 hour since categories don't change frequently
        cache.set(cache_key, response_data, 3600)

        return Response(response_data)


# class StockUpdateView(APIView):
#     def patch(self, request, product_id):
#         """Update stock for a specific product."""
#         try:
#             stock = Stock.objects.get(product_id=product_id)
#             stock.quantity += int(request.data.get("quantity", 0))
#             stock.save()
#             return Response(
#                 {"message": "Stock updated successfully."}, status=status.HTTP_200_OK
#             )
#         except Stock.DoesNotExist:
#             return Response(
#                 {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
#             )


class WishlistView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get user's wishlist."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Get or create wishlist for user
        wishlist, created = Wishlist.objects.get_or_create(user=request.user)
        serializer = WishlistSerializer(wishlist)
        return Response(serializer.data)

    def post(self, request):
        """Add a product to wishlist."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Support both product_id and productId for frontend compatibility
        product_id = request.data.get("product_id") or request.data.get("productId")
        if not product_id:
            return Response(
                {"error": "product_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Get or create wishlist for user
        wishlist, created = Wishlist.objects.get_or_create(user=request.user)

        # Check if already in wishlist
        wishlist_item, created = WishlistItem.objects.get_or_create(
            wishlist=wishlist, product=product
        )

        if created:
            serializer = WishlistItemSerializer(wishlist_item)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        else:
            return Response(
                {"message": "Product already in wishlist"}, status=status.HTTP_200_OK
            )

    def delete(self, request):
        """Remove a product from wishlist."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Support both product_id and productId for frontend compatibility
        product_id = request.data.get("product_id") or request.data.get("productId")
        if not product_id:
            return Response(
                {"error": "product_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            wishlist = Wishlist.objects.get(user=request.user)
            wishlist_item = WishlistItem.objects.get(
                wishlist=wishlist, product_id=product_id
            )
            wishlist_item.delete()
            return Response(
                {"message": "Product removed from wishlist"}, status=status.HTTP_200_OK
            )
        except Wishlist.DoesNotExist:
            return Response(
                {"error": "Wishlist not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except WishlistItem.DoesNotExist:
            return Response(
                {"error": "Product not in wishlist"}, status=status.HTTP_404_NOT_FOUND
            )


class CartView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get user's cart with all items."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Get or create cart for user
        cart, created = Cart.objects.get_or_create(user=request.user)
        serializer = CartSerializer(cart)
        return Response(serializer.data)

    def post(self, request):
        """Add a product to cart or update quantity."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Support both product_id and productId for frontend compatibility
        product_id = request.data.get("product_id") or request.data.get("productId")
        quantity = request.data.get("quantity", 1)

        if not product_id:
            return Response(
                {"error": "product_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from decimal import Decimal

            quantity = Decimal(str(quantity))
            if quantity <= 0:
                return Response(
                    {"error": "Quantity must be greater than 0"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except (ValueError, TypeError, Exception):
            return Response(
                {"error": "Invalid quantity"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Get or create cart for user
        cart, created = Cart.objects.get_or_create(user=request.user)

        # Get or create cart item
        cart_item, item_created = CartItem.objects.get_or_create(
            cart=cart, product=product, defaults={"quantity": quantity}
        )

        if not item_created:
            # Update quantity if item already exists
            cart_item.quantity += quantity
            cart_item.save()

        serializer = CartItemSerializer(cart_item)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def patch(self, request):
        """Update cart item quantity."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Support both product_id and productId for frontend compatibility
        product_id = request.data.get("product_id") or request.data.get("productId")
        quantity = request.data.get("quantity")

        if not product_id or quantity is None:
            return Response(
                {"error": "product_id and quantity are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from decimal import Decimal

            quantity = Decimal(str(quantity))
            if quantity < 0:
                return Response(
                    {"error": "Quantity cannot be negative"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except (ValueError, TypeError, Exception):
            return Response(
                {"error": "Invalid quantity"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            cart = Cart.objects.get(user=request.user)
            cart_item = CartItem.objects.get(cart=cart, product_id=product_id)

            if quantity == 0:
                # Remove item if quantity is 0
                cart_item.delete()
                return Response(
                    {"message": "Item removed from cart"}, status=status.HTTP_200_OK
                )
            else:
                # Update quantity
                cart_item.quantity = quantity
                cart_item.save()
                serializer = CartItemSerializer(cart_item)
                return Response(serializer.data)

        except Cart.DoesNotExist:
            return Response(
                {"error": "Cart not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except CartItem.DoesNotExist:
            return Response(
                {"error": "Item not in cart"}, status=status.HTTP_404_NOT_FOUND
            )

    def delete(self, request):
        """Remove a product from cart or clear entire cart."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Support both product_id and productId for frontend compatibility
        product_id = request.data.get("product_id") or request.data.get("productId")

        try:
            cart = Cart.objects.get(user=request.user)

            if product_id:
                # Remove specific item
                cart_item = CartItem.objects.get(cart=cart, product_id=product_id)
                cart_item.delete()
                return Response(
                    {"message": "Product removed from cart"}, status=status.HTTP_200_OK
                )
            else:
                # Clear entire cart
                cart.items.all().delete()
                return Response({"message": "Cart cleared"}, status=status.HTTP_200_OK)

        except Cart.DoesNotExist:
            return Response(
                {"error": "Cart not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except CartItem.DoesNotExist:
            return Response(
                {"error": "Product not in cart"}, status=status.HTTP_404_NOT_FOUND
            )
