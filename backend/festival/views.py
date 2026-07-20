from __future__ import annotations

import json
import logging

from django.conf import settings
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from festival.models import FestivalProduct
from festival.permissions import IsFestivalStaff
from festival.serializers import (
    FestivalOrderCreateSerializer,
    FestivalProductSerializer,
    serialize_order_response,
)
from festival.services.cloudprnt import (
    CloudPRNTAuthError,
    CloudPRNTError,
    authenticate_cloudprnt,
    handle_job_delete,
    handle_job_get,
    handle_poll,
    printer_status_payload,
    server_settings_http_only,
)
from festival.services.orders import FestivalOrderError, place_festival_order

logger = logging.getLogger(__name__)


class FestivalProductsView(APIView):
    authentication_classes = [JWTAuthentication, SessionAuthentication]
    permission_classes = [IsFestivalStaff]

    def get(self, request):
        if not getattr(settings, "FESTIVAL_ENABLED", False):
            return Response(
                {"detail": "Festival ordering is disabled."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        products = (
            FestivalProduct.objects.filter(is_active=True)
            .select_related("category")
            .order_by("category__name", "name")
        )
        data = FestivalProductSerializer(products, many=True).data
        return Response({"results": data})


class FestivalStatusView(APIView):
    authentication_classes = [JWTAuthentication, SessionAuthentication]
    permission_classes = [IsFestivalStaff]

    def get(self, request):
        payload = printer_status_payload()
        return Response(
            {
                "enabled": payload["enabled"],
                "mode": payload["mode"],
                "online": payload["online"],
                "last_seen_at": payload["last_seen_at"],
                "queued_jobs": payload["queued_jobs"],
                "can_accept_orders": payload["can_accept_orders"],
            }
        )


class FestivalOrdersView(APIView):
    authentication_classes = [JWTAuthentication, SessionAuthentication]
    permission_classes = [IsFestivalStaff]

    def post(self, request):
        serializer = FestivalOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client_request_id = serializer.validated_data["client_request_id"]
        header_key = request.headers.get("Idempotency-Key")
        if header_key:
            try:
                import uuid

                header_uuid = uuid.UUID(str(header_key))
            except ValueError:
                return Response(
                    {"detail": "Invalid Idempotency-Key header."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if header_uuid != client_request_id:
                return Response(
                    {
                        "detail": "Idempotency-Key header must match client_request_id."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        try:
            result = place_festival_order(
                user=request.user,
                client_request_id=client_request_id,
                items=serializer.validated_data["items"],
            )
        except FestivalOrderError as exc:
            return Response(
                {"detail": str(exc), "code": exc.code},
                status=exc.status,
            )
        body = serialize_order_response(result.order, replayed=result.replayed)
        return Response(
            body,
            status=status.HTTP_200_OK if result.replayed else status.HTTP_201_CREATED,
        )


def _cloudprnt_401() -> HttpResponse:
    response = HttpResponse(status=401)
    response["WWW-Authenticate"] = 'Basic realm="Festival CloudPRNT"'
    return response


def _extract_mac(request) -> str:
    return (
        request.GET.get("mac")
        or request.headers.get("X-Star-Mac")
        or request.META.get("HTTP_X_STAR_MAC")
        or ""
    )


def _extract_token(request) -> str:
    return (
        request.GET.get("token")
        or request.headers.get("X-Star-Token")
        or request.META.get("HTTP_X_STAR_TOKEN")
        or ""
    )


@method_decorator(csrf_exempt, name="dispatch")
class FestivalCloudPRNTView(APIView):
    """Star CloudPRNT Version HTTP endpoint (printer is the client)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def dispatch(self, request, *args, **kwargs):
        try:
            authenticate_cloudprnt(request)
        except CloudPRNTAuthError:
            return _cloudprnt_401()
        return super().dispatch(request, *args, **kwargs)

    def get(self, request):
        # Server-setting GET (MQTT discovery) has no type/token print-job params.
        media_type = request.GET.get("type") or ""
        token = _extract_token(request)
        mac = _extract_mac(request)

        if not media_type and not token:
            return Response(server_settings_http_only(), status=200)

        try:
            payload = handle_job_get(mac=mac, media_type=media_type, token=token)
        except CloudPRNTError as exc:
            return HttpResponse(str(exc), status=exc.status, content_type="text/plain")
        return HttpResponse(payload, content_type="text/plain")

    def post(self, request):
        try:
            if isinstance(request.data, dict):
                payload = request.data
            else:
                payload = json.loads(request.body.decode("utf-8") or "{}")
        except (TypeError, ValueError, json.JSONDecodeError):
            return Response({"detail": "Invalid JSON."}, status=400)

        mac = payload.get("printerMAC") or _extract_mac(request)
        try:
            body = handle_poll(payload, mac_override=mac)
        except CloudPRNTError as exc:
            return Response({"detail": str(exc)}, status=exc.status)
        return Response(body, status=200)

    def delete(self, request):
        mac = _extract_mac(request)
        token = _extract_token(request)
        code = request.GET.get("code") or "200 OK"
        retry_raw = request.GET.get("retry")
        retry = int(retry_raw) if retry_raw and retry_raw.isdigit() else None
        try:
            handle_job_delete(mac=mac, token=token, code=code, retry=retry)
        except CloudPRNTError as exc:
            return HttpResponse(status=exc.status)
        return HttpResponse(status=200)
