from account.models import CustomUser
from api.models import Order, Product
from reconciliation.models import BankTransaction
from rest_framework.response import Response
from rest_framework.views import APIView
from shipping.models import Shipment

from .permissions import IsAdminStaffUser
from .serializers import DashboardSummarySerializer


class DashboardSummaryAPIView(APIView):
    permission_classes = [IsAdminStaffUser]

    def get(self, request):
        data = {
            "total_orders": Order.objects.count(),
            "pending_orders": Order.objects.filter(status="pending").count(),
            # In current order lifecycle, "delivered" is the closest completed state.
            "completed_orders": Order.objects.filter(status="delivered").count(),
            "total_products": Product.objects.count(),
            "active_products": Product.objects.filter(active=True).count(),
            "total_customers": CustomUser.objects.filter(is_staff=False).count(),
            "total_shipments": Shipment.objects.count(),
            # Reconciliation is considered unresolved while unmatched/suggested.
            "unreconciled_bank_transactions": BankTransaction.objects.filter(
                match_status__in=[
                    BankTransaction.MatchStatus.UNMATCHED,
                    BankTransaction.MatchStatus.SUGGESTED,
                ]
            ).count(),
        }
        serializer = DashboardSummarySerializer(data)
        return Response(serializer.data)
