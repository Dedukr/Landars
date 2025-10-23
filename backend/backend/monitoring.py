import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List

import psutil
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse

logger = logging.getLogger(__name__)


def get_system_metrics() -> Dict:
    """Get comprehensive system metrics"""
    try:
        # CPU metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        cpu_count = psutil.cpu_count()

        # Memory metrics
        memory = psutil.virtual_memory()
        memory_percent = memory.percent
        memory_available_gb = memory.available / (1024**3)

        # Disk metrics
        disk = psutil.disk_usage("/")
        disk_percent = (disk.used / disk.total) * 100
        disk_free_gb = disk.free / (1024**3)

        # Network metrics
        network = psutil.net_io_counters()

        return {
            "timestamp": datetime.now().isoformat(),
            "cpu": {
                "percent": cpu_percent,
                "count": cpu_count,
                "load_average": (
                    psutil.getloadavg() if hasattr(psutil, "getloadavg") else None
                ),
            },
            "memory": {
                "percent": memory_percent,
                "available_gb": round(memory_available_gb, 2),
                "total_gb": round(memory.total / (1024**3), 2),
            },
            "disk": {
                "percent": round(disk_percent, 2),
                "free_gb": round(disk_free_gb, 2),
                "total_gb": round(disk.total / (1024**3), 2),
            },
            "network": {
                "bytes_sent": network.bytes_sent,
                "bytes_recv": network.bytes_recv,
                "packets_sent": network.packets_sent,
                "packets_recv": network.packets_recv,
            },
        }
    except Exception as e:
        logger.error(f"Failed to get system metrics: {e}")
        return {"error": str(e)}


def get_database_metrics() -> Dict:
    """Get database performance metrics"""
    try:
        with connection.cursor() as cursor:
            # Get database size
            cursor.execute(
                """
                SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
            """
            )
            db_size = cursor.fetchone()[0]

            # Get active connections
            cursor.execute(
                """
                SELECT count(*) as active_connections 
                FROM pg_stat_activity 
                WHERE state = 'active'
            """
            )
            active_connections = cursor.fetchone()[0]

            # Get table sizes
            cursor.execute(
                """
                SELECT 
                    schemaname,
                    tablename,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
                LIMIT 10
            """
            )
            table_sizes = cursor.fetchall()

            return {
                "timestamp": datetime.now().isoformat(),
                "database_size": db_size,
                "active_connections": active_connections,
                "table_sizes": [
                    {"schema": row[0], "table": row[1], "size": row[2]}
                    for row in table_sizes
                ],
            }
    except Exception as e:
        logger.error(f"Failed to get database metrics: {e}")
        return {"error": str(e)}


def get_application_metrics() -> Dict:
    """Get application-specific metrics"""
    try:
        # Get cache statistics
        cache_stats = {}
        if hasattr(settings, "CACHES") and "default" in settings.CACHES:
            cache_backend = settings.CACHES["default"]["BACKEND"]
            if "redis" in cache_backend.lower():
                try:
                    cache_stats = {
                        "backend": "redis",
                        "status": (
                            "connected" if cache.get("health_check") else "disconnected"
                        ),
                    }
                except:
                    cache_stats = {"backend": "redis", "status": "error"}
            else:
                cache_stats = {"backend": cache_backend, "status": "configured"}

        # Get Django settings info
        settings_info = {
            "debug": settings.DEBUG,
            "allowed_hosts": settings.ALLOWED_HOSTS,
            "database_engine": settings.DATABASES["default"]["ENGINE"],
            "timezone": str(settings.TIME_ZONE),
        }

        return {
            "timestamp": datetime.now().isoformat(),
            "cache": cache_stats,
            "settings": settings_info,
        }
    except Exception as e:
        logger.error(f"Failed to get application metrics: {e}")
        return {"error": str(e)}


def production_health_check(request):
    """Production-grade health check with detailed metrics"""
    try:
        system_metrics = get_system_metrics()
        database_metrics = get_database_metrics()
        application_metrics = get_application_metrics()

        # Determine overall health
        health_status = "healthy"
        warnings = []

        # Check system health
        if "error" not in system_metrics:
            if system_metrics["cpu"]["percent"] > 90:
                health_status = "degraded"
                warnings.append("High CPU usage")

            if system_metrics["memory"]["percent"] > 90:
                health_status = "degraded"
                warnings.append("High memory usage")

            if system_metrics["disk"]["percent"] > 90:
                health_status = "critical"
                warnings.append("Critical disk usage")

        response_data = {
            "status": health_status,
            "timestamp": datetime.now().isoformat(),
            "warnings": warnings,
            "metrics": {
                "system": system_metrics,
                "database": database_metrics,
                "application": application_metrics,
            },
        }

        status_code = 200 if health_status == "healthy" else 503
        return JsonResponse(response_data, status=status_code)

    except Exception as e:
        logger.error(f"Production health check failed: {e}")
        return JsonResponse(
            {"status": "error", "message": f"Health check failed: {str(e)}"}, status=500
        )


def health_trends(request):
    """Get health trends over time (simplified version)"""
    try:
        # This would typically store metrics in a time-series database
        # For now, return current metrics as trends
        current_metrics = get_system_metrics()

        trends_data = {
            "timestamp": datetime.now().isoformat(),
            "trends": {
                "cpu_trend": [current_metrics.get("cpu", {}).get("percent", 0)],
                "memory_trend": [current_metrics.get("memory", {}).get("percent", 0)],
                "disk_trend": [current_metrics.get("disk", {}).get("percent", 0)],
            },
            "summary": {
                "avg_cpu": current_metrics.get("cpu", {}).get("percent", 0),
                "avg_memory": current_metrics.get("memory", {}).get("percent", 0),
                "avg_disk": current_metrics.get("disk", {}).get("percent", 0),
            },
        }

        return JsonResponse(trends_data)

    except Exception as e:
        logger.error(f"Health trends failed: {e}")
        return JsonResponse(
            {"error": f"Failed to get health trends: {str(e)}"}, status=500
        )
