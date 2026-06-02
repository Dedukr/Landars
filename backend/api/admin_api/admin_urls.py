from django.urls import path

from .views import AdminDashboardAPIView

app_name = "admin_api_admin"

urlpatterns = [
    path("dashboard/", AdminDashboardAPIView.as_view(), name="admin-dashboard"),
]
