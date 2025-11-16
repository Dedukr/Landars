"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.views.decorators.http import require_http_methods

from . import health_checks


@require_http_methods(["GET"])
def health_check(request):
    """Health check endpoint for Docker health checks"""
    try:
        # Simple health check without database dependency
        return JsonResponse(
            {
                "status": "healthy",
                "service": "backend",
                "timestamp": "2025-01-18T21:30:00Z",
            }
        )
    except Exception as e:
        return JsonResponse(
            {"status": "unhealthy", "service": "backend", "error": str(e)}, status=500
        )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("api/auth/", include("account.urls")),
    path("api/payments/", include("api.payment_urls")),
    path("health/", health_check, name="health_check"),
    path(
        "health/comprehensive/",
        health_checks.comprehensive_health_check,
        name="comprehensive_health_check",
    ),
    path(
        "health/simple/", health_checks.simple_health_check, name="simple_health_check"
    ),
    path(
        "api-auth/", include("rest_framework.urls")
    ),  # Uncomment if you want to use the browsable API authentication
]
