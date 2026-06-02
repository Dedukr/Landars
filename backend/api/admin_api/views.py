from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdminStaffUser
from .periods import resolve_dashboard_period
from .serializers import AdminDashboardSerializer, DashboardSummarySerializer
from .services import build_admin_dashboard, build_admin_dashboard_summary_only


class DashboardSummaryAPIView(APIView):
    permission_classes = [IsAdminStaffUser]

    def get(self, request):
        data = build_admin_dashboard_summary_only()
        serializer = DashboardSummarySerializer(data)
        return Response(serializer.data)


class AdminDashboardAPIView(APIView):
    """
    Full admin home dashboard payload (KPIs, charts, recent orders, breakdowns,
    top products, alerts). Supports ?period=7d|30d|90d|this_month.
    """

    permission_classes = [IsAdminStaffUser]

    def get(self, request):
        period = resolve_dashboard_period(request.query_params.get("period"))
        data = build_admin_dashboard(period)
        serializer = AdminDashboardSerializer(data)
        return Response(serializer.data)
