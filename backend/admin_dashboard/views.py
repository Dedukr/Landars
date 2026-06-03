"""
Admin dashboard API views.

This module owns the view logic; ``api.admin_api.views`` re-exports from here
so the URL routing layer stays thin and the dashboard app is self-contained.

Endpoints (mounted via api/admin_api/ URL conf):
    GET /api/admin/dashboard/?period=7d|30d|90d|this_month
    GET /api/dashboard/summary/

Authentication & authorisation
───────────────────────────────
Both views use ``IsAdminStaffUser`` (is_authenticated + is_staff). This is
stricter than DRF's built-in ``IsAdminUser`` and is explicitly required so
the endpoint is never accidentally public.

The project uses JWT (SimpleJWT). JWTs are validated by the authentication
backend before reaching the permission check, so staff users who hold a valid
access token can reach the endpoint without any additional configuration.
"""

from __future__ import annotations

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from api.admin_api.permissions import IsAdminStaffUser

from .services import get_dashboard_data, get_summary_snapshot


class AdminDashboardView(APIView):
    """
    Full admin home dashboard payload.

    Query params
    ────────────
    period  7d | 30d | 90d | this_month   (default: 30d)

    Response shape
    ──────────────
    {
        "period": "30d",
        "period_start": "<iso8601>",
        "period_end":   "<iso8601>",
        "kpis":         { … },
        "charts":       { "sales_chart": [ … ] },
        "recent_orders": [ … ],
        "breakdowns":   { … },
        "top_products": [ … ],
        "alerts":       { "failed_shipments": [], … },
        "summary":      { … }
    }
    """

    permission_classes = [IsAdminStaffUser]

    def get(self, request: Request) -> Response:
        period = request.query_params.get("period", "30d")
        return Response(get_dashboard_data(period))


class DashboardSummaryView(APIView):
    """
    Legacy summary endpoint — kept for backward compatibility.
    Mounted at GET /api/dashboard/summary/.
    """

    permission_classes = [IsAdminStaffUser]

    def get(self, request: Request) -> Response:
        return Response(get_summary_snapshot())
