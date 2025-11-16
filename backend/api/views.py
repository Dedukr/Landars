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
    OrderItem,
    Product,
    ProductCategory,
    Wishlist,
    WishlistItem,
)
from .serializers import (
    CartItemSerializer,
    CartSerializer,
    CategorySerializer,
    OrderItemSerializer,
    OrderSerializer,
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

    def put(self, request):
        """Update cart metadata (notes, delivery_fee, discount, is_home_delivery, delivery_date)."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            cart = Cart.objects.get(user=request.user)

            # Update fields if provided
            if "notes" in request.data:
                cart.notes = request.data.get("notes", "")
            if "delivery_date" in request.data:
                delivery_date = request.data.get("delivery_date")
                cart.delivery_date = delivery_date if delivery_date else None
            if "discount" in request.data:
                from decimal import Decimal

                cart.discount = Decimal(str(request.data.get("discount", 0)))
            if "delivery_fee" in request.data:
                from decimal import Decimal

                cart.delivery_fee = Decimal(str(request.data.get("delivery_fee", 0)))
            if "is_home_delivery" in request.data:
                cart.is_home_delivery = request.data.get("is_home_delivery", True)

            # If recalculate_delivery is True, calculate delivery fee and type automatically
            if request.data.get("recalculate_delivery", False):
                self._calculate_delivery_type_and_fee(cart)

            cart.save()
            serializer = CartSerializer(cart)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except Cart.DoesNotExist:
            return Response(
                {"error": "Cart not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def _calculate_delivery_type_and_fee(self, cart):
        """
        Calculate delivery type and fee automatically based on cart contents.
        Implements the same logic as OrderAdmin.save_related method.
        """
        items = cart.items.all()

        if not items.exists():
            cart.is_home_delivery = True
            cart.delivery_fee = 0
            return

        # Sausage category name
        post_suitable_category = "Sausages and Marinated products"
        # Check if ALL products are sausages (only sausages)
        all_products_are_sausages = True
        for item in items:
            category_names = item.product.categories.values_list("name", flat=True)
            if post_suitable_category not in [name.lower() for name in category_names]:
                all_products_are_sausages = False
                break

        if all_products_are_sausages:
            # ALL products are sausages, use post delivery
            cart.is_home_delivery = False
            if cart.sum_price > 220:
                cart.delivery_fee = 0
            else:
                total_weight = sum(item.quantity for item in items)
                if total_weight <= 2:
                    cart.delivery_fee = 5
                elif total_weight <= 10:
                    cart.delivery_fee = 8
                else:
                    cart.delivery_fee = 15
        else:
            # Mixed products or no sausages, use home delivery
            cart.is_home_delivery = True
            cart.delivery_fee = 10

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


class OrderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get user's orders with filtering and pagination."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Get user's orders
        orders = Order.objects.filter(customer=request.user).prefetch_related(
            "items__product"
        )

        # Filtering
        status_filter = request.query_params.get("status")
        if status_filter:
            orders = orders.filter(status=status_filter)

        # Date filtering
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            orders = orders.filter(order_date__gte=date_from)
        if date_to:
            orders = orders.filter(order_date__lte=date_to)

        # Sorting
        sort = request.query_params.get("sort", "-order_date")
        if sort in [
            "order_date",
            "-order_date",
            "delivery_date",
            "-delivery_date",
            "total_price",
            "-total_price",
        ]:
            orders = orders.order_by(sort)

        # Pagination
        limit = int(request.query_params.get("limit", 20))
        offset = int(request.query_params.get("offset", 0))

        total_count = orders.count()
        orders = orders[offset : offset + limit]

        serializer = OrderSerializer(orders, many=True)

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

        return Response(response_data)

    def post(self, request):
        """Create a new order from cart items."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            # Get user's cart
            cart = Cart.objects.get(user=request.user)
            cart_items = cart.items.all()

            if not cart_items.exists():
                return Response(
                    {"error": "Cart is empty"}, status=status.HTTP_400_BAD_REQUEST
                )

            # Create order using values from cart (ensure consistency)
            # Prioritize cart values as the single source of truth - all cart fields are saved to order
            order_data = {
                "customer": request.user,
                "notes": cart.notes or request.data.get("notes", ""),
                "delivery_date": cart.delivery_date or request.data.get("delivery_date"),
                "discount": cart.discount or request.data.get("discount", 0),
                "is_home_delivery": cart.is_home_delivery,
                "delivery_fee": cart.delivery_fee or request.data.get("delivery_fee", 0),
                "status": "pending",
            }

            # Handle payment information if provided
            payment_intent_id = request.data.get("payment_intent_id")
            payment_status = request.data.get("payment_status")
            
            if payment_intent_id:
                order_data["payment_intent_id"] = payment_intent_id
            
            if payment_status:
                # Map "paid" to "succeeded" for payment_status field (Stripe uses "succeeded")
                if payment_status == "paid":
                    order_data["payment_status"] = "succeeded"
                else:
                    order_data["payment_status"] = payment_status
                
                # If payment is succeeded/paid, update order status
                if payment_status in ["succeeded", "paid"]:
                    order_data["status"] = "paid"

            order = Order.objects.create(**order_data)

            # Create order items from cart items
            for cart_item in cart_items:
                OrderItem.objects.create(
                    order=order, product=cart_item.product, quantity=cart_item.quantity
                )

            # Only recalculate if delivery_fee_manual is False (admin override)
            # Otherwise use cart values
            if not order.delivery_fee_manual:
                self._calculate_delivery_type_and_fee(order)

            # Delete the cart instance completely after order is created
            # This ensures all cart data is transferred to the order
            cart.delete()

            serializer = OrderSerializer(order)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Cart.DoesNotExist:
            return Response(
                {"error": "Cart not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            import traceback
            error_details = str(e)
            # Log the full traceback for debugging
            print(f"Error creating order: {error_details}")
            print(traceback.format_exc())
            return Response(
                {"error": f"Failed to create order: {error_details}"}, 
                status=status.HTTP_400_BAD_REQUEST
            )

    def _calculate_delivery_type_and_fee(self, order):
        """
        Calculate delivery type and fee automatically based on cart contents.
        Implements the same logic as OrderAdmin.save_related method.
        """
        items = order.items.all()

        if not order.delivery_fee_manual:
            # Sausage category name
            post_suitable_category = "Sausages and Marinated products"
            # Check if ALL products are sausages (only sausages)
            all_products_are_sausages = True
            for item in items:
                category_names = item.product.categories.values_list("name", flat=True)
                if post_suitable_category not in [
                    name.lower() for name in category_names
                ]:
                    all_products_are_sausages = False
                    break

            if all_products_are_sausages:
                # ALL products are sausages, use post delivery
                order.is_home_delivery = False
                if order.total_price > 220:
                    order.delivery_fee = 0
                else:
                    total_weight = sum(item.quantity for item in items)
                    if total_weight <= 2:
                        order.delivery_fee = 5
                    elif total_weight <= 10:
                        order.delivery_fee = 8
                    else:
                        order.delivery_fee = 15
            else:
                # Mixed products or no sausages, use home delivery
                order.is_home_delivery = True
                order.delivery_fee = 10
        order.save()


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, order_id):
        """Get a specific order by ID."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            order = Order.objects.prefetch_related("items__product").get(
                id=order_id, customer=request.user
            )
            serializer = OrderSerializer(order)
            return Response(serializer.data)

        except Order.DoesNotExist:
            return Response(
                {"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND
            )

    def patch(self, request, order_id):
        """Update order status (limited to certain statuses for customers)."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            order = Order.objects.get(id=order_id, customer=request.user)

            # Only allow customers to cancel orders
            new_status = request.data.get("status")
            if new_status == "cancelled" and order.status in ["pending", "paid"]:
                order.status = new_status
                order.save()
                serializer = OrderSerializer(order)
                return Response(serializer.data)
            else:
                return Response(
                    {"error": "Cannot update order status"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        except Order.DoesNotExist:
            return Response(
                {"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND
            )


class UserOrdersView(APIView):
    """View for loading past orders of a specific user (admin functionality)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        """Get all orders for a specific user."""
        # Check if the requesting user is staff/admin
        if not request.user.is_staff:
            return Response(
                {"error": "Permission denied. Admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            # Get the target user
            from django.contrib.auth import get_user_model

            User = get_user_model()
            target_user = User.objects.get(id=user_id)

            # Get user's orders with filtering and pagination
            orders = Order.objects.filter(customer=target_user).prefetch_related(
                "items__product"
            )

            # Filtering
            status_filter = request.query_params.get("status")
            if status_filter:
                orders = orders.filter(status=status_filter)

            # Date filtering
            date_from = request.query_params.get("date_from")
            date_to = request.query_params.get("date_to")
            if date_from:
                orders = orders.filter(order_date__gte=date_from)
            if date_to:
                orders = orders.filter(order_date__lte=date_to)

            # Delivery date filtering
            delivery_date_from = request.query_params.get("delivery_date_from")
            delivery_date_to = request.query_params.get("delivery_date_to")
            if delivery_date_from:
                orders = orders.filter(delivery_date__gte=delivery_date_from)
            if delivery_date_to:
                orders = orders.filter(delivery_date__lte=delivery_date_to)

            # Sorting
            sort = request.query_params.get("sort", "-order_date")
            if sort in [
                "order_date",
                "-order_date",
                "delivery_date",
                "-delivery_date",
                "total_price",
                "-total_price",
            ]:
                orders = orders.order_by(sort)

            # Pagination
            limit = int(request.query_params.get("limit", 20))
            offset = int(request.query_params.get("offset", 0))

            total_count = orders.count()
            orders = orders[offset : offset + limit]

            serializer = OrderSerializer(orders, many=True)

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
                "user": {
                    "id": target_user.id,
                    "name": (
                        target_user.name
                        if hasattr(target_user, "name")
                        else target_user.username
                    ),
                    "email": target_user.email,
                },
            }

            return Response(response_data)

        except User.DoesNotExist:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
