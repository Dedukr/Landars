from rest_framework.response import Response
from rest_framework.views import APIView

from admin_dashboard.services import get_dashboard_data, get_summary_snapshot

from .permissions import IsAdminStaffUser


class DashboardSummaryAPIView(APIView):
    permission_classes = [IsAdminStaffUser]

    def get(self, request):
        return Response(get_summary_snapshot())


class AdminDashboardAPIView(APIView):
    """
    Full admin home dashboard payload.
    Supports ?period=7d|30d|90d|this_month.
    """

    permission_classes = [IsAdminStaffUser]

    def get(self, request):
        period = request.query_params.get("period", "30d")
        return Response(get_dashboard_data(period))
