"""
Shipment HTTP API (Sendcloud quoting, legacy parcel create, webhooks).

Public URLs remain ``/api/shipping/...`` for marketplace compatibility.
"""

import hashlib
import hmac
import json
import logging

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Shipment
from .sendcloud_client import SendcloudAPIError
from .sendcloud_shipping import ShippingService

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def get_shipping_options(request):
    """
    Get available shipping options for a given address and cart items.

    POST /api/shipping/options/
    """
    try:
        address = request.data.get("address", {})
        items = request.data.get("items", [])

        required_fields = ["country", "postal_code"]
        missing_fields = [f for f in required_fields if not address.get(f)]
        if missing_fields:
            return Response(
                {
                    "success": False,
                    "error": f"Missing required address fields: {', '.join(missing_fields)}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = ShippingService()
        options = service.get_shipping_options(address=address, items=items)

        logger.info(f"Returning {len(options)} shipping options to frontend")
        if options:
            logger.debug(f"First option: {options[0]}")

        return Response({"success": True, "options": options})

    except SendcloudAPIError as e:
        logger.error(f"Sendcloud API error: {e}")
        return Response(
            {
                "success": False,
                "error": "Failed to retrieve shipping options. Please try again later.",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    except Exception as e:
        logger.error(f"Unexpected error in get_shipping_options: {e}", exc_info=True)
        return Response(
            {"success": False, "error": "An unexpected error occurred."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def create_shipment(request):
    """
    Create a shipment for an order (legacy Sendcloud flow for home delivery).

    POST /api/shipping/shipments/
    """
    from api.models import Order

    try:
        order_id = request.data.get("order_id")
        shipping_method_id = request.data.get("shipping_method_id")

        if not order_id or not shipping_method_id:
            return Response(
                {
                    "success": False,
                    "error": "Both order_id and shipping_method_id are required.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {"success": False, "error": f"Order with id {order_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if order.customer != request.user and not request.user.is_staff:
            return Response(
                {
                    "success": False,
                    "error": "You don't have permission to create shipment for this order.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if order.payment_status != "succeeded":
            return Response(
                {
                    "success": False,
                    "error": "Order must be paid before creating shipment.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        details = order.ensure_shipping_details()
        details.shipping_method_id = shipping_method_id
        details.save(update_fields=["shipping_method_id"])

        service = ShippingService()
        shipment = service.create_shipment(order, shipping_method_id)

        details.shipping_tracking_number = shipment.get("tracking_number")
        details.shipping_tracking_url = shipment.get("tracking_url")
        if shipment.get("label_url"):
            details.provider_label_url = (shipment.get("label_url") or "")[:600]
        details.sendcloud_parcel_id = shipment.get("parcel_id")
        details.status = Shipment.Status.LABEL_DOWNLOAD_PENDING
        details.last_error = ""
        details.save(
            update_fields=[
                "shipping_tracking_number",
                "shipping_tracking_url",
                "provider_label_url",
                "sendcloud_parcel_id",
                "status",
                "last_error",
            ]
        )

        return Response({"success": True, "shipment": shipment})

    except SendcloudAPIError as e:
        logger.error(f"Sendcloud API error: {e}")
        return Response(
            {
                "success": False,
                "error": "Failed to create shipment. Please try again later.",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    except Exception as e:
        logger.error(f"Unexpected error in create_shipment: {e}", exc_info=True)
        return Response(
            {"success": False, "error": "An unexpected error occurred."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_shipment_status(request, parcel_id):
    """GET /api/shipping/shipments/<parcel_id>/"""
    from api.models import Order

    try:
        try:
            order = Order.objects.get(shipping_details__sendcloud_parcel_id=parcel_id)
            if order.customer != request.user and not request.user.is_staff:
                return Response(
                    {"success": False, "error": "Permission denied."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Order.DoesNotExist:
            return Response(
                {"success": False, "error": "Shipment not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        service = ShippingService()
        shipment_status = service.get_shipment_status(int(parcel_id))

        return Response({"success": True, "shipment": shipment_status})

    except SendcloudAPIError as e:
        logger.error(f"Sendcloud API error: {e}")
        return Response(
            {"success": False, "error": "Failed to retrieve shipment status."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    except Exception as e:
        logger.error(f"Unexpected error in get_shipment_status: {e}", exc_info=True)
        return Response(
            {"success": False, "error": "An unexpected error occurred."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _map_sendcloud_status_to_shipping_status(
    sendcloud_status_message, sendcloud_status_id=None
):
    if not sendcloud_status_message:
        return None

    status_lower = sendcloud_status_message.lower()

    status_mapping = {
        "no label": "pending_shipment",
        "ready to send": "label_created",
        "ready to process": "pending_shipment",
        "being announced": "label_created",
        "announcing": "label_created",
        "in transit": "in_transit",
        "on the way": "in_transit",
        "in transportation": "in_transit",
        "picked up": "in_transit",
        "collected": "in_transit",
        "departed": "in_transit",
        "arrived": "in_transit",
        "out for delivery": "out_for_delivery",
        "on route": "out_for_delivery",
        "out for delivery today": "out_for_delivery",
        "delivered": "delivered",
        "successfully delivered": "delivered",
        "failed": "shipment_failed",
        "returned": "shipment_failed",
        "address invalid": "shipment_failed",
        "undeliverable": "shipment_failed",
    }

    if status_lower in status_mapping:
        return status_mapping[status_lower]

    for key, value in status_mapping.items():
        if key in status_lower:
            return value

    if sendcloud_status_id:
        if sendcloud_status_id == 999:
            return "pending_shipment"
        elif sendcloud_status_id == 1000:
            return "label_created"

    logger.warning(
        f"Unmapped SendCloud status: {sendcloud_status_message} (ID: {sendcloud_status_id})"
    )
    return None


def _verify_webhook_signature(request_body, signature_header):
    webhook_secret = getattr(settings, "SENDCLOUD_WEBHOOK_SECRET", "")

    if not webhook_secret:
        logger.debug(
            "SENDCLOUD_WEBHOOK_SECRET not configured, skipping signature verification"
        )
        return True

    if not signature_header:
        logger.warning("Webhook secret configured but no signature header provided")
        return False

    expected_signature = hmac.new(
        webhook_secret.encode("utf-8"), request_body, hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected_signature, signature_header)


@csrf_exempt
@require_POST
def sendcloud_webhook(request):
    """POST /api/shipping/webhook/"""
    from api.models import Order

    try:
        signature_header = request.META.get("HTTP_X_SENDCLOUD_SIGNATURE", "")
        if not _verify_webhook_signature(request.body, signature_header):
            logger.warning(
                f"Invalid webhook signature. Request from IP: {request.META.get('REMOTE_ADDR', 'unknown')}"
            )
            return HttpResponse(status=401)

        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in SendCloud webhook: {e}")
            return HttpResponse(status=400)

        parcel = payload.get("parcel") or payload.get("data", {}).get("parcel")
        if not parcel:
            logger.error(f"Missing parcel data in webhook payload: {payload}")
            return HttpResponse(status=400)

        parcel_id = parcel.get("id")
        if not parcel_id:
            logger.error(f"Missing parcel ID in webhook payload: {parcel}")
            return HttpResponse(status=400)

        status_info = parcel.get("status", {})
        status_message = status_info.get("message", "")
        status_id = status_info.get("id")

        tracking_number = parcel.get("tracking_number")
        tracking_url = parcel.get("tracking_url")

        logger.info(
            f"Received SendCloud webhook for parcel {parcel_id}: "
            f"status={status_message} (ID: {status_id})"
        )

        try:
            order = Order.objects.select_related("shipping_details").get(
                shipping_details__sendcloud_parcel_id=parcel_id
            )
        except Order.DoesNotExist:
            logger.warning(
                f"No order found with sendcloud_parcel_id={parcel_id}. "
                f"This may be a parcel created outside our system."
            )
            return HttpResponse(status=200)

        details = order.ensure_shipping_details()

        new_shipping_status = _map_sendcloud_status_to_shipping_status(
            status_message, status_id
        )

        update_fields: list[str] = []

        if new_shipping_status == "shipment_failed":
            if details.status != Shipment.Status.FAILED_FINAL:
                details.status = Shipment.Status.FAILED_RETRYABLE
                update_fields.append("status")
            err = (status_message or "")[:2000]
            if err and details.last_error != err:
                details.last_error = err
                update_fields.append("last_error")
            logger.info(
                "Sendcloud webhook: parcel %s failure for order %s — %s",
                parcel_id,
                order.id,
                status_message,
            )

        if tracking_number and details.shipping_tracking_number != tracking_number:
            details.shipping_tracking_number = tracking_number
            update_fields.append("shipping_tracking_number")
            logger.info(f"Updated order {order.id} tracking number: {tracking_number}")

        if tracking_url and details.shipping_tracking_url != tracking_url:
            details.shipping_tracking_url = tracking_url
            update_fields.append("shipping_tracking_url")

        carrier = parcel.get("carrier")
        if isinstance(carrier, dict):
            code = str(carrier.get("code") or "")[:64]
            if code and details.carrier_code != code:
                details.carrier_code = code
                update_fields.append("carrier_code")

        if update_fields:
            details.save(update_fields=sorted(set(update_fields)))
            logger.info(
                f"Successfully updated shipping details for order {order.id}: "
                f"{', '.join(update_fields)}"
            )
        else:
            logger.debug(f"No updates needed for order {order.id} (parcel {parcel_id})")

        return HttpResponse(status=200)

    except Exception as e:
        logger.error(
            f"Error processing SendCloud webhook: {e}",
            exc_info=True,
            extra={
                "payload": str(request.body[:500]) if hasattr(request, "body") else None
            },
        )
        return HttpResponse(status=500)
