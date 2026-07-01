"""
Admin API views for review management.

Endpoints (all require is_staff):
    GET    /api/admin/reviews/          list with search, filters, pagination
    POST   /api/admin/reviews/          create a manual review
    GET    /api/admin/reviews/{id}/     review detail
    PATCH  /api/admin/reviews/{id}/     partial update (rating, title, comment, approve, feature)
    DELETE /api/admin/reviews/{id}/     hard delete
"""
import logging

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import Product, ProductReview
from api.serializers import ReviewAdminSerializer

logger = logging.getLogger(__name__)
User = get_user_model()


# ── Inline serializer used only for admin creation ─────────────────────────

class AdminReviewCreateSerializer(serializers.ModelSerializer):
    """Writable serializer for staff-initiated review creation."""

    class Meta:
        model = ProductReview
        fields = ["rating", "title", "comment", "is_approved", "is_featured"]

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def validate_comment(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Comment cannot be blank.")
        return cleaned

    def validate_title(self, value):
        return (value or "").strip()


# ── List + Create ───────────────────────────────────────────────────────────

class AdminReviewListView(APIView):
    """
    GET  /api/admin/reviews/  — paginated list with search + filters (staff only).
    POST /api/admin/reviews/  — create a manual review (staff only).

    GET query params:
        search      — searches comment, title, user email/name, product name
        type        — "product" | "shop" | "" (all)
        rating      — 1-5
        is_approved — "true" | "false" | "" (all)
        is_featured — "true" | "false" | "" (all)
        ordering    — one of: id, -id, rating, -rating, created_at, -created_at
        limit       — int (1–100, default 20)
        offset      — int (default 0)
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    _VALID_ORDERINGS = {"id", "-id", "rating", "-rating", "created_at", "-created_at"}

    def get(self, request):
        qs = ProductReview.objects.select_related("user", "product")

        # ── Search ──────────────────────────────────────────────────────────
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(comment__icontains=search)
                | Q(title__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__name__icontains=search)
                | Q(product__name__icontains=search)
            )

        # ── Type filter ──────────────────────────────────────────────────────
        review_type = request.query_params.get("type", "").strip()
        if review_type == "product":
            qs = qs.filter(product__isnull=False)
        elif review_type == "shop":
            qs = qs.filter(product__isnull=True)

        # ── Rating filter ────────────────────────────────────────────────────
        try:
            rating = int(request.query_params.get("rating", 0))
            if 1 <= rating <= 5:
                qs = qs.filter(rating=rating)
        except (ValueError, TypeError):
            pass

        # ── Boolean filters ──────────────────────────────────────────────────
        for param, field in (("is_approved", "is_approved"), ("is_featured", "is_featured")):
            val = request.query_params.get(param, "").strip().lower()
            if val == "true":
                qs = qs.filter(**{field: True})
            elif val == "false":
                qs = qs.filter(**{field: False})

        # ── Ordering ─────────────────────────────────────────────────────────
        ordering = request.query_params.get("ordering", "-created_at")
        if ordering not in self._VALID_ORDERINGS:
            ordering = "-created_at"
        qs = qs.order_by(ordering)

        # ── Pagination ───────────────────────────────────────────────────────
        try:
            limit = max(1, min(100, int(request.query_params.get("limit", 20))))
            offset = max(0, int(request.query_params.get("offset", 0)))
        except (ValueError, TypeError):
            limit, offset = 20, 0

        total = qs.count()
        page = qs[offset : offset + limit]
        serializer = ReviewAdminSerializer(page, many=True)
        return Response({"count": total, "results": serializer.data})

    def post(self, request):
        # ── Resolve user ─────────────────────────────────────────────────────
        user_id = request.data.get("user")
        if not user_id:
            return Response(
                {"error": "user (ID) is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": f"User with id={user_id} not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Resolve product ──────────────────────────────────────────────────
        product = None
        product_id = request.data.get("product")
        if product_id:
            try:
                product = Product.objects.get(pk=product_id)
            except Product.DoesNotExist:
                return Response(
                    {"error": f"Product with id={product_id} not found."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ── Validate + save ──────────────────────────────────────────────────
        create_ser = AdminReviewCreateSerializer(data=request.data)
        if not create_ser.is_valid():
            logger.warning("AdminReview creation failed: %s", create_ser.errors)
            return Response(create_ser.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            review = create_ser.save(user=user, product=product)
        except Exception as exc:
            # Catches unique_shop_review_per_user constraint violation and other DB errors
            logger.warning("AdminReview save failed for user=%s: %s", user_id, exc)
            return Response(
                {"error": "Could not save review. The user may already have a shop review."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            ReviewAdminSerializer(review).data,
            status=status.HTTP_201_CREATED,
        )


# ── Detail + Patch + Delete ─────────────────────────────────────────────────

class AdminReviewDetailView(APIView):
    """
    GET    /api/admin/reviews/{id}/  — full detail (staff only).
    PATCH  /api/admin/reviews/{id}/  — partial update: rating, title, comment,
                                       is_approved, is_featured (staff only).
    DELETE /api/admin/reviews/{id}/  — hard delete (staff only).
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def _get_review(self, pk):
        try:
            return ProductReview.objects.select_related("user", "product").get(pk=pk)
        except ProductReview.DoesNotExist:
            return None

    def get(self, request, review_id):
        review = self._get_review(review_id)
        if not review:
            return Response(
                {"error": "Review not found."}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(ReviewAdminSerializer(review).data)

    def patch(self, request, review_id):
        review = self._get_review(review_id)
        if not review:
            return Response(
                {"error": "Review not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Only allow editing moderation fields + content; user/product cannot change
        EDITABLE = {"rating", "title", "comment", "is_approved", "is_featured"}
        data = {k: v for k, v in request.data.items() if k in EDITABLE}

        serializer = ReviewAdminSerializer(review, data=data, partial=True)
        if not serializer.is_valid():
            logger.warning("AdminReview update %s failed: %s", review_id, serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response(serializer.data)

    def delete(self, request, review_id):
        review = self._get_review(review_id)
        if not review:
            return Response(
                {"error": "Review not found."}, status=status.HTTP_404_NOT_FOUND
            )
        review.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
