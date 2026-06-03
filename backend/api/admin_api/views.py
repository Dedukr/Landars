"""
Thin routing shim — re-exports views from the canonical admin_dashboard app.

Keeping views in ``admin_dashboard.views`` makes the dashboard app self-
contained. This file exists only to satisfy DRF URL conf conventions.
"""

from admin_dashboard.views import AdminDashboardView as AdminDashboardAPIView
from admin_dashboard.views import DashboardSummaryView as DashboardSummaryAPIView

__all__ = ["AdminDashboardAPIView", "DashboardSummaryAPIView"]
