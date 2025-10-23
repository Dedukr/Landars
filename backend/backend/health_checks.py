import logging
import os
import time

import psutil
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse

logger = logging.getLogger(__name__)


def check_database():
    """Check database connectivity and performance"""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            if result[0] == 1:
                return True, "Database connection successful"
            else:
                return False, "Database query failed"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False, f"Database error: {str(e)}"


def check_redis():
    """Check Redis/cache connectivity"""
    try:
        # Check if cache is configured (not using default dummy cache)
        if hasattr(settings, "CACHES") and "default" in settings.CACHES:
            cache_backend = settings.CACHES["default"]["BACKEND"]
            if "dummy" in cache_backend:
                return True, "Cache not configured (using dummy cache)"

            # Try to use cache if available
            try:
                cache.set("health_check", "ok", 10)
                result = cache.get("health_check")
                if result == "ok":
                    return True, "Cache connection successful"
                else:
                    return False, "Cache test failed"
            except Exception as cache_error:
                logger.warning(f"Cache operation failed: {cache_error}")
                return True, "Cache not available (graceful fallback)"
        else:
            return True, "Cache not configured (using default)"
    except Exception as e:
        logger.error(f"Cache health check failed: {e}")
        return True, "Cache not available (graceful fallback)"


def check_disk_space():
    """Check available disk space"""
    try:
        disk_usage = psutil.disk_usage("/")
        free_gb = disk_usage.free / (1024**3)
        total_gb = disk_usage.total / (1024**3)
        usage_percent = (disk_usage.used / disk_usage.total) * 100

        if usage_percent > 90:
            return (
                False,
                f"Disk usage critical: {usage_percent:.1f}% used ({free_gb:.1f}GB free)",
            )
        elif usage_percent > 80:
            return (
                True,
                f"Disk usage warning: {usage_percent:.1f}% used ({free_gb:.1f}GB free)",
            )
        else:
            return (
                True,
                f"Disk usage normal: {usage_percent:.1f}% used ({free_gb:.1f}GB free)",
            )
    except Exception as e:
        logger.error(f"Disk space check failed: {e}")
        return False, f"Disk check error: {str(e)}"


def check_memory():
    """Check system memory usage"""
    try:
        memory = psutil.virtual_memory()
        usage_percent = memory.percent
        available_gb = memory.available / (1024**3)

        if usage_percent > 90:
            return (
                False,
                f"Memory usage critical: {usage_percent:.1f}% used ({available_gb:.1f}GB available)",
            )
        elif usage_percent > 80:
            return (
                True,
                f"Memory usage warning: {usage_percent:.1f}% used ({available_gb:.1f}GB available)",
            )
        else:
            return (
                True,
                f"Memory usage normal: {usage_percent:.1f}% used ({available_gb:.1f}GB available)",
            )
    except Exception as e:
        logger.error(f"Memory check failed: {e}")
        return False, f"Memory check error: {str(e)}"


def comprehensive_health_check(request):
    """Comprehensive health check with all system metrics"""
    try:
        checks = {
            "database": check_database(),
            "cache": check_redis(),
            "disk_space": check_disk_space(),
            "memory": check_memory(),
        }

        all_healthy = all(result[0] for result in checks.values())
        status_code = 200 if all_healthy else 503

        response_data = {
            "status": "healthy" if all_healthy else "unhealthy",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "checks": {
                name: {"status": "pass" if result[0] else "fail", "message": result[1]}
                for name, result in checks.items()
            },
        }

        return JsonResponse(response_data, status=status_code)

    except Exception as e:
        logger.error(f"Comprehensive health check failed: {e}")
        return JsonResponse(
            {"status": "error", "message": f"Health check failed: {str(e)}"}, status=500
        )


def simple_health_check(request):
    """Simple health check for basic connectivity"""
    try:
        # Just check database connectivity
        db_healthy, db_message = check_database()

        if db_healthy:
            return JsonResponse(
                {
                    "status": "healthy",
                    "message": "Service is running",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            )
        else:
            return JsonResponse(
                {
                    "status": "unhealthy",
                    "message": db_message,
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                },
                status=503,
            )

    except Exception as e:
        logger.error(f"Simple health check failed: {e}")
        return JsonResponse(
            {"status": "error", "message": f"Health check failed: {str(e)}"}, status=500
        )
