import logging
import uuid
from decimal import Decimal

from account.models import Address
from django.conf import settings
from django.contrib.admin.views.decorators import staff_member_required
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import (
    DecimalField,
    ExpressionWrapper,
    F,
    Min,
    OuterRef,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView
from shipping.models import Shipment

from .models import (
    Cart,
    CartItem,
    Order,
    OrderItem,
    Product,
    ProductCategory,
    ProductImage,
    ProductReview,
    Wishlist,
    WishlistItem,
)
from .r2_storage import (
    generate_presigned_upload_url,
    generate_unique_object_key,
    upload_compressed_image_to_r2,
    validate_image_size,
    validate_image_type,
)
from .serializers import (
    CartItemSerializer,
    CartSerializer,
    CategorySerializer,
    OrderItemSerializer,
    OrderSerializer,
    ProductListSerializer,
    ProductReviewSerializer,
    ProductSerializer,
    WishlistItemSerializer,
    WishlistSerializer,
)

logger = logging.getLogger(__name__)
from .validators import validate_image_file_extension


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
        no_cache = request.query_params.get("no_cache") == "1"
        # Cache key version suffix bumps stale entries when search logic changes
        cache_key = f"products_v10_{hash(str(request.query_params))}"

        # Try to get cached response
        if not no_cache:
            cached_response = cache.get(cache_key)
            if cached_response:
                return Response(cached_response)

        # Optimize database queries: prefetch categories (and parent) to avoid N+1 in serializer
        products = (
            Product.objects.prefetch_related("categories__parent", "images")
            .filter(active=True)
        )

        # Filtering (categories, optional group shortcut, include subcategories)
        from api.services.category_groups import (
            category_ids_for_group,
            expand_category_ids_for_product_filter,
        )

        filter_category_ids: list[int] = []

        category_group = request.query_params.get("category_group")
        if category_group and category_group.isdigit():
            filter_category_ids.extend(category_ids_for_group(int(category_group)))

        categories = request.query_params.get("categories")
        if categories:
            filter_category_ids.extend(
                int(cid) for cid in categories.split(",") if cid.isdigit()
            )

        category = request.query_params.get("category")
        if category and category.isdigit():
            filter_category_ids.append(int(category))

        post_delivery = request.query_params.get("post_delivery")
        if post_delivery in ("1", "true", "yes"):
            from api.services.post_delivery_categories import (
                get_post_delivery_category_ids,
            )

            filter_category_ids.extend(get_post_delivery_category_ids())

        if filter_category_ids:
            expanded = expand_category_ids_for_product_filter(filter_category_ids)
            if expanded:
                products = products.filter(categories__id__in=expanded).distinct()
            else:
                products = products.none()

        # Exclude specific products
        exclude = request.query_params.get("exclude")
        if exclude:
            exclude_ids = [int(pid) for pid in exclude.split(",") if pid.isdigit()]
            if exclude_ids:
                products = products.exclude(id__in=exclude_ids)

        search = request.query_params.get("search")
        if search:
            # Use partial matching so normal typing (prefix/infix) returns results.
            # Require all terms to appear somewhere in the product name.
            terms = [t.strip() for t in search.split() if t.strip()]
            for term in terms:
                products = products.filter(name__icontains=term)

        # Annotate with calculated price (base_price + holiday_fee) for filtering and sorting
        products = products.annotate(calculated_price=F("base_price") + F("holiday_fee"))

        price_min = request.query_params.get("price_min")
        price_max = request.query_params.get("price_max")
        if price_min:
            products = products.filter(calculated_price__gte=price_min)
        if price_max:
            products = products.filter(calculated_price__lte=price_max)

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
            products = products.order_by("calculated_price")
        elif sort == "price_desc":
            products = products.order_by("-calculated_price")
        elif sort == "created_at_desc":
            products = products.order_by("-created_at")
        elif sort == "created_at_asc":
            products = products.order_by("created_at")
        elif sort == "sales_desc":
            products = products.order_by("-sold_quantity", "-sold_orders_count", "id")
        elif sort == "sales_asc":
            products = products.order_by("sold_quantity", "sold_orders_count", "id")
        elif sort == "category_asc":
            products = (
                products.annotate(
                    category_parent_sort=Coalesce(
                        Min("categories__parent__name"), Value("")
                    ),
                    category_sort=Coalesce(Min("categories__name"), Value("")),
                )
                .order_by("category_parent_sort", "category_sort", "id")
                .distinct()
            )

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

        serializer = ProductListSerializer(products, many=True)

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
        if not no_cache:
            cache.set(cache_key, response_data, 300)

        # Return paginated response
        return Response(response_data)

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
    permission_classes = [
        AllowAny
    ]  # Allow unauthenticated access to view product details

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
            return (
                Product.objects.filter(active=True)
                .prefetch_related("images")
                .get(id=product_id)
            )
        except Product.DoesNotExist:
            return None


class ProductReviewListCreate(APIView):
    """List reviews for a product (GET) or create a review (POST). One review per user per product."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_product(self, product_id):
        try:
            return Product.objects.filter(active=True).get(id=product_id)
        except Product.DoesNotExist:
            return None

    def get(self, request, product_id):
        product = self.get_product(product_id)
        if not product:
            return Response(
                {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
            )
        reviews = product.reviews.all().select_related("user")
        serializer = ProductReviewSerializer(reviews, many=True)
        return Response(serializer.data)

    def post(self, request, product_id):
        product = self.get_product(product_id)
        if not product:
            return Response(
                {"error": "Product not found"}, status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = ProductReviewSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(product=product, user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        # Log validation errors for debugging
        logger.warning(f"ProductReview validation failed: {serializer.errors}, data: {request.data}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CategoryList(APIView):
    permission_classes = [AllowAny]  # Allow unauthenticated access to view categories
    throttle_classes = []  # Disable throttling for categories endpoint

    def get(self, request):
        """Retrieve all categories."""
        cache_key = "categories_list_v4"
        cached_response = cache.get(cache_key)
        if cached_response:
            return Response(cached_response)

        categories = list(ProductCategory.objects.all())
        category_ids = [c.id for c in categories]

        from api.services.category_display import category_display_context

        serializer = CategorySerializer(
            categories,
            many=True,
            context=category_display_context(category_ids),
        )
        response_data = serializer.data

        # Cache for 1 hour since categories don't change frequently
        cache.set(cache_key, response_data, 3600)

        return Response(response_data)


class CategoryGroupList(APIView):
    """All category groups for storefront navigation."""

    permission_classes = [AllowAny]
    throttle_classes = []

    def get(self, request):
        from api.models import CategoryGroup
        from api.serializers import CategoryGroupSerializer
        from api.services.category_display import products_count_by_category_id

        cache_key = "category_groups_list_v1"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        groups = list(
            CategoryGroup.objects.prefetch_related("categories").order_by("-name")
        )
        all_cat_ids: list[int] = []
        for group in groups:
            all_cat_ids.extend(c.id for c in group.categories.all())
        products_count = products_count_by_category_id(list(set(all_cat_ids)))

        data = []
        for group in groups:
            row = CategoryGroupSerializer(
                group,
                context={
                    "products_count": {
                        group.id: sum(
                            products_count.get(cid, 0)
                            for cid in group.categories.values_list("id", flat=True)
                        )
                    }
                },
            ).data
            data.append(row)

        cache.set(cache_key, data, 3600)
        return Response(data)


class CategoryGroupPostDelivery(APIView):
    """Post-delivery category group (``POST_DELIVERY_CATEGORY_GROUP_ID``, default 1)."""

    permission_classes = [AllowAny]
    throttle_classes = []

    def get(self, request):
        from api.models import CategoryGroup
        from api.serializers import CategoryGroupSerializer
        from api.services.post_delivery_categories import (
            post_delivery_category_group_id,
        )

        cache_key = f"category_group_post_delivery_v1:{post_delivery_category_group_id()}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        group = (
            CategoryGroup.objects.filter(pk=post_delivery_category_group_id())
            .prefetch_related("categories")
            .first()
        )
        if not group:
            return Response(
                {"error": "Post-delivery category group not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = CategoryGroupSerializer(group).data
        cache.set(cache_key, data, 3600)
        return Response(data)


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
# except Exception as e:
#     return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# class OrderListCreateView(APIView):
#     """List all orders or create a new order."""

#     permission_classes = [IsAuthenticated]

#     def get(self, request):
#         """Retrieve all orders for the authenticated user."""
#         orders = Order.objects.filter(customer=request.user).order_by("-id")
#         serializer = OrderSerializer(orders, many=True)
#         return Response(serializer.data)

#     def post(self, request):
#         """Create a new order."""
#         # Add customer from authenticated user
#         data = request.data.copy()
#         data["customer"] = request.user.id

#         serializer = OrderSerializer(data=data)
#         if serializer.is_valid():
#             try:
#                 # Create the order
#                 order = serializer.save()
#                 return Response(
#                     OrderSerializer(order).data, status=status.HTTP_201_CREATED
#                 )
#             except Exception as e:
#                 return Response(
#                     {"error": f"Failed to create order: {str(e)}"},
#                     status=status.HTTP_400_BAD_REQUEST,
#                 )
#         return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def _annotate_total_for_sort(orders):
    """Annotate an Order queryset with ``_total_sort`` matching Order.total_price.

    ``Order.total_price`` is a Python @property, so it cannot appear directly in
    ``.order_by()``. We replicate it at the DB level so price-based sorting works
    for the customer order list views.
    """
    from decimal import Decimal

    decimal_field = DecimalField(max_digits=14, decimal_places=2)

    # Per-item line total preferring the snapshot ``item_price``, falling back to
    # the current ``product.price`` for legacy rows.
    line_total = ExpressionWrapper(
        Coalesce(F("item_price"), F("product__price")) * F("quantity"),
        output_field=decimal_field,
    )

    items_total_subquery = (
        OrderItem.objects.filter(order=OuterRef("pk"))
        .annotate(_line=line_total)
        .values("order")
        .annotate(_sum=Sum("_line"))
        .values("_sum")
    )

    zero = Decimal("0.00")
    hundred = Decimal("100")

    return orders.annotate(
        _items_total=Coalesce(
            Subquery(items_total_subquery, output_field=decimal_field),
            zero,
            output_field=decimal_field,
        ),
    ).annotate(
        _total_sort=ExpressionWrapper(
            F("_items_total")
            + (F("_items_total") * F("holiday_fee") / hundred)
            + F("delivery_fee")
            - F("discount"),
            output_field=decimal_field,
        ),
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
            orders = orders.filter(created_at__date__gte=date_from)
        if date_to:
            orders = orders.filter(created_at__date__lte=date_to)

        # Sorting
        sort = request.query_params.get("sort", "-created_at")
        if sort in [
            "created_at",
            "-created_at",
            "order_date",
            "-order_date",
            "delivery_date",
            "-delivery_date",
            "total_price",
            "-total_price",
        ]:
            # Map order_date to created_at for backward compatibility
            if sort == "order_date":
                sort = "created_at"
            elif sort == "-order_date":
                sort = "-created_at"
            # total_price is a Python @property, not a DB column.
            # Annotate the queryset with a DB-level computed total that mirrors
            # Order.total_price = sum(line_total) * (1 + holiday_fee/100)
            #                    + delivery_fee - discount
            if sort in ("total_price", "-total_price"):
                orders = _annotate_total_for_sort(orders)
                sort = "_total_sort" if sort == "total_price" else "-_total_sort"
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
            with transaction.atomic():
                return self._create_order_from_cart(request)
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
                status=status.HTTP_400_BAD_REQUEST,
            )

    def _create_order_from_cart(self, request):
        """Create order, items, and shipment inside an atomic transaction."""
        from notifications.services.order_alerts import (
            schedule_new_frontend_order_telegram_alert,
        )

        # Get user's cart
        cart = Cart.objects.get(user=request.user)
        cart_items = cart.items.all()

        if not cart_items.exists():
            return Response(
                {"error": "Cart is empty"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Create order using values from cart (ensure consistency)
        # Prioritize cart values as the single source of truth - all cart fields are saved to order
        # Convert discount and delivery_fee to Decimal to avoid type errors
        discount_value = cart.discount or request.data.get("discount", 0)

        # If shipping option is selected, use its price as delivery_fee
        # Otherwise fall back to cart delivery_fee or request delivery_fee
        shipping_cost = request.data.get("shipping_cost")
        if shipping_cost:
            # Use shipping option price as delivery fee
            delivery_fee_value = shipping_cost
        else:
            delivery_fee_value = cart.delivery_fee or request.data.get(
                "delivery_fee", 0
            )

        # Ensure values are Decimal type
        if isinstance(discount_value, str):
            discount_value = (
                Decimal(discount_value) if discount_value else Decimal(0)
            )
        elif not isinstance(discount_value, Decimal):
            discount_value = Decimal(str(discount_value))

        if isinstance(delivery_fee_value, str):
            delivery_fee_value = (
                Decimal(delivery_fee_value) if delivery_fee_value else Decimal(0)
            )
        elif not isinstance(delivery_fee_value, Decimal):
            delivery_fee_value = Decimal(str(delivery_fee_value))

        # Convert shipping_cost to Decimal if provided
        shipping_cost_decimal = None
        if shipping_cost:
            if isinstance(shipping_cost, str):
                shipping_cost_decimal = (
                    Decimal(shipping_cost) if shipping_cost else None
                )
            elif not isinstance(shipping_cost, Decimal):
                shipping_cost_decimal = Decimal(str(shipping_cost))
            else:
                shipping_cost_decimal = shipping_cost

        order_data = {
            "customer": request.user,
            "notes": cart.notes or request.data.get("notes", ""),
            "delivery_date": cart.delivery_date
            or request.data.get("delivery_date"),
            "discount": discount_value,
            "is_home_delivery": cart.is_home_delivery,
            "delivery_fee": delivery_fee_value,
            "status": "pending",
            "source": Order.Source.FRONTEND,
        }

        shipping_details_data = {}
        if request.data.get("shipping_method_id"):
            shipping_details_data["shipping_method_id"] = request.data.get(
                "shipping_method_id"
            )

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

        # Handle address from form data
        address_data = request.data.get("address")
        if address_data:
            # Create a new address instance for this order
            address = Address.objects.create(
                address_line=address_data.get("address_line", ""),
                address_line2=address_data.get("address_line2", ""),
                city=address_data.get("city", ""),
                postal_code=address_data.get("postal_code", ""),
            )
            order_data["address"] = address

        order = Order.objects.create(**order_data)
        if shipping_details_data:
            Shipment.objects.create(
                order=order,
                status=Shipment.Status.DRAFT,
                **shipping_details_data,
            )

        # Create order items from cart items
        for cart_item in cart_items:
            OrderItem.objects.create(
                order=order, product=cart_item.product, quantity=cart_item.quantity
            )

        # If shipping option was selected, don't recalculate delivery fee
        # The delivery_fee is already set from shipping_cost
        # Only recalculate if no shipping option was selected and delivery_fee_manual is False
        if not order.delivery_fee_manual and not shipping_cost:
            self._calculate_delivery_type_and_fee(order)

        # Trigger shipment creation if order is paid and has shipping method
        shipping_details = getattr(order, "shipping_details", None)
        if (
            order.status == "paid"
            and shipping_details
            and shipping_details.shipping_method_id
            and order.is_home_delivery
        ):
            # Import here to avoid circular imports
            from shipping.sendcloud_shipping import ShippingService

            try:
                shipping_service = ShippingService()
                result = shipping_service.create_shipment_for_order(order)

                if result.get("skipped"):
                    pass
                elif result.get("success"):
                    logger.info(
                        f"Shipment created for order {order.id}: "
                        f"tracking={result.get('tracking_number')}"
                    )
                else:
                    logger.warning(
                        f"Failed to create shipment for order {order.id}: "
                        f"{result.get('error')}"
                    )
            except Exception as e:
                # Don't fail the order creation if shipment creation fails
                logger.error(
                    f"Exception while creating shipment for order {order.id}: {e}",
                    exc_info=True,
                )

        # Do not auto-promote paid → ready_to_ship.
        # If ops sets status to ready_to_ship manually, shipment automation
        # remains automatic via shipping signals on that transition.

        # Delete the cart instance completely after order is created
        # This ensures all cart data is transferred to the order
        cart.delete()

        schedule_new_frontend_order_telegram_alert(order.id)

        serializer = OrderSerializer(order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _calculate_delivery_type_and_fee(self, order):
        """
        Calculate delivery type and fee automatically based on cart contents.
        Uses Royal Mail pricing for post-delivery group categories (same as cart).
        """
        from decimal import Decimal

        from api.services.post_delivery_categories import (
            product_has_post_delivery_category,
        )
        from shipping.sendcloud_shipping import ShippingService

        items = order.items.select_related("product").all()

        if not order.delivery_fee_manual:
            all_post_delivery = all(
                item.product and product_has_post_delivery_category(item.product)
                for item in items
            ) and items.exists()

            if all_post_delivery:
                # All lines are in the post-delivery category group — Royal Mail pricing
                order.is_home_delivery = False
                merch = Decimal(0)
                for item in items:
                    tp = item.get_total_price()
                    if tp != "":
                        merch += Decimal(str(tp))
                if merch > Decimal("220"):
                    order.delivery_fee = Decimal("0")
                else:
                    total_weight = ShippingService.parcel_weight_kg_from_line_items(
                        items
                    )
                    addr = order.get_delivery_address()
                    postal = (addr.postal_code or "").strip() if addr else ""
                    order.delivery_fee = ShippingService.get_delivery_fee_by_weight(
                        total_weight,
                        to_country="GB",
                        to_postal_code=postal or None,
                    )
            else:
                order.is_home_delivery = True
                order.delivery_fee = Decimal("10")
        order.save()


class OrderDetailView(APIView):
    """
    Retrieve, update or delete a specific order.
    """

    permission_classes = [IsAuthenticated]

    def get_object(self, order_id, user):
        """Get order object and check ownership."""
        try:
            return (
                Order.objects.select_related("address", "shipping_details")
                .get(id=order_id, customer=user)
            )
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
        """Update order status (limited to certain statuses for customers)."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
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
            product = Product.objects.filter(active=True).get(id=product_id)
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

        # Add item to order (raises ValidationError if item already exists)
        try:
            item = order.add_item_safely(product, quantity)
            serializer = OrderItemSerializer(item)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            product = Product.objects.filter(active=True).get(id=product_id)
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
            product = Product.objects.filter(active=True).get(id=product_id)
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

        # Recalculate delivery fee based on updated cart contents
        self._calculate_delivery_type_and_fee(cart)
        cart.save()

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

                # Recalculate delivery fee after removing item
                self._calculate_delivery_type_and_fee(cart)
                cart.save()

                return Response(
                    {"message": "Item removed from cart"}, status=status.HTTP_200_OK
                )
            else:
                # Update quantity
                cart_item.quantity = quantity
                cart_item.save()

                # Recalculate delivery fee based on updated cart contents
                self._calculate_delivery_type_and_fee(cart)
                cart.save()

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
        Uses Royal Mail pricing for post-delivery group categories.
        """
        from decimal import Decimal

        from api.services.post_delivery_categories import (
            product_has_post_delivery_category,
        )
        from shipping.sendcloud_shipping import ShippingService

        items = cart.items.select_related("product").all()

        if not items.exists():
            cart.is_home_delivery = True
            cart.delivery_fee = Decimal("0")
            return

        all_post_delivery = all(
            item.product and product_has_post_delivery_category(item.product)
            for item in items
        )

        if all_post_delivery:
            # All lines are in the post-delivery category group — Royal Mail pricing
            cart.is_home_delivery = False
            if cart.sum_price > 220:
                cart.delivery_fee = Decimal("0")
            else:
                total_weight = ShippingService.parcel_weight_kg_from_line_items(items)
                cart.delivery_fee = ShippingService.get_delivery_fee_by_weight(
                    total_weight
                )
        else:
            cart.is_home_delivery = True
            cart.delivery_fee = Decimal("10")

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

                # Recalculate delivery fee after removing item
                self._calculate_delivery_type_and_fee(cart)
                cart.save()

                return Response(
                    {"message": "Product removed from cart"}, status=status.HTTP_200_OK
                )
            else:
                # Clear entire cart
                cart.items.all().delete()

                # Recalculate delivery fee (should be 0 for empty cart)
                self._calculate_delivery_type_and_fee(cart)
                cart.save()

                return Response({"message": "Cart cleared"}, status=status.HTTP_200_OK)

        except Cart.DoesNotExist:
            return Response(
                {"error": "Cart not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except CartItem.DoesNotExist:
            return Response(
                {"error": "Product not in cart"}, status=status.HTTP_404_NOT_FOUND
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
                orders = orders.filter(created_at__date__gte=date_from)
            if date_to:
                orders = orders.filter(created_at__date__lte=date_to)

            # Delivery date filtering
            delivery_date_from = request.query_params.get("delivery_date_from")
            delivery_date_to = request.query_params.get("delivery_date_to")
            if delivery_date_from:
                orders = orders.filter(delivery_date__gte=delivery_date_from)
            if delivery_date_to:
                orders = orders.filter(delivery_date__lte=delivery_date_to)

            # Sorting
            sort = request.query_params.get("sort", "-created_at")
            if sort in [
                "created_at",
                "-created_at",
                "order_date",
                "-order_date",
                "delivery_date",
                "-delivery_date",
                "total_price",
                "-total_price",
            ]:
                if sort == "order_date":
                    sort = "created_at"
                elif sort == "-order_date":
                    sort = "-created_at"
                # total_price is a Python @property; annotate at the DB level
                if sort in ("total_price", "-total_price"):
                    orders = _annotate_total_for_sort(orders)
                    sort = (
                        "_total_sort" if sort == "total_price" else "-_total_sort"
                    )
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
                Product.objects.filter(active=True).get(id=product_id)
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
        if "image" not in request.FILES:
            return Response(
                {
                    "error": "No image file provided. Use 'image' field in multipart/form-data."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        image_file = request.FILES["image"]
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
                {"message": "Stock updated successfully."}, status=status.HTTP_200_OK
            )
