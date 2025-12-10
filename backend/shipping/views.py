"""
Shipping API Views

Provides REST API endpoints for:
- Getting shipping options
- Creating shipments
- Checking shipment status
- Receiving SendCloud webhook updates
"""

import hashlib
import hmac
import json
import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .sendcloud_client import SendcloudAPIError
from .service import ShippingService

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def get_shipping_options(request):
    """
    Get available shipping options for a given address and cart items.

    POST /api/shipping/options/

    Request body:
    {
        "address": {
            "country": "GB",
            "postal_code": "SW1A 1AA",
            "city": "London",
            "address_line": "10 Downing Street"
        },
        "items": [
            {
                "product_id": 1,
                "quantity": 2.5
            }
        ]
    }

    Response:
    {
        "success": true,
        "options": [
            {
                "id": 8,
                "carrier": "DPD",
                "name": "DPD Home",
                "price": "5.99",
                "currency": "GBP",
                "min_delivery_days": 1,
                "max_delivery_days": 2
            }
        ]
    }
    """
    try:
        # Extract address and items from request
        address = request.data.get("address", {})
        items = request.data.get("items", [])

        # Validate required address fields
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

        # Get shipping options using the service
        service = ShippingService()
        options = service.get_shipping_options(address=address, items=items)

        # Log the options for debugging
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
    Create a shipment for an order.

    POST /api/shipping/shipments/

    Request body:
    {
        "order_id": 123,
        "shipping_method_id": 8
    }

    Response:
    {
        "success": true,
        "shipment": {
            "parcel_id": "12345",
            "tracking_number": "ABC123456789",
            "tracking_url": "https://...",
            "label_url": "https://...",
            "carrier": "dpd",
            "status": "announced"
        }
    }
    """
    from api.models import Order

    try:
        # Extract order_id and shipping_method_id
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

        # Get the order
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {"success": False, "error": f"Order with id {order_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Verify order belongs to requesting user or user is staff
        if order.customer != request.user and not request.user.is_staff:
            return Response(
                {
                    "success": False,
                    "error": "You don't have permission to create shipment for this order.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Verify order is paid
        if order.payment_status != "succeeded":
            return Response(
                {
                    "success": False,
                    "error": "Order must be paid before creating shipment.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Ensure shipping details record and store method
        details = order.ensure_shipping_details()
        details.shipping_method_id = shipping_method_id
        details.save(update_fields=["shipping_method_id"])

        # Create shipment
        service = ShippingService()
        shipment = service.create_shipment(order, shipping_method_id)

        # Update shipping details with shipment information
        details.shipping_tracking_number = shipment.get("tracking_number")
        details.shipping_tracking_url = shipment.get("tracking_url")
        details.shipping_label_url = shipment.get("label_url")
        details.sendcloud_parcel_id = shipment.get("parcel_id")
        details.shipping_status = "label_created"
        details.shipping_error_message = None
        details.save(
            update_fields=[
                "shipping_tracking_number",
                "shipping_tracking_url",
                "shipping_label_url",
                "sendcloud_parcel_id",
                "shipping_status",
                "shipping_error_message",
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
    """
    Get the status of a shipment.

    GET /api/shipping/shipments/<parcel_id>/

    Response:
    {
        "success": true,
        "shipment": {
            "parcel_id": "12345",
            "tracking_number": "ABC123456789",
            "status": "in_transit",
            "carrier": "dpd"
        }
    }
    """
    from api.models import Order

    try:
        # Verify user has access to this shipment
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
    """
    Map SendCloud status messages to our shipping_status field values.

    Args:
        sendcloud_status_message: The status message from SendCloud (e.g., "Ready to send", "In transit")
        sendcloud_status_id: Optional status ID from SendCloud

    Returns:
        str: One of our shipping_status choices or None if unmapped
    """
    if not sendcloud_status_message:
        return None

    status_lower = sendcloud_status_message.lower()

    # Map SendCloud status messages to our status values
    status_mapping = {
        # Label creation states
        "no label": "pending_shipment",
        "ready to send": "label_created",
        "ready to process": "pending_shipment",
        "being announced": "label_created",
        "announcing": "label_created",
        # In transit states
        "in transit": "in_transit",
        "on the way": "in_transit",
        "in transportation": "in_transit",
        "picked up": "in_transit",
        "collected": "in_transit",
        "departed": "in_transit",
        "arrived": "in_transit",
        # Out for delivery
        "out for delivery": "out_for_delivery",
        "on route": "out_for_delivery",
        "out for delivery today": "out_for_delivery",
        # Delivered
        "delivered": "delivered",
        "successfully delivered": "delivered",
        # Failed/Error states
        "failed": "shipment_failed",
        "returned": "shipment_failed",
        "address invalid": "shipment_failed",
        "undeliverable": "shipment_failed",
    }

    # Check exact match first
    if status_lower in status_mapping:
        return status_mapping[status_lower]

    # Check partial matches
    for key, value in status_mapping.items():
        if key in status_lower:
            return value

    # Default mapping based on status ID if provided
    if sendcloud_status_id:
        # Status ID 999 = No label
        if sendcloud_status_id == 999:
            return "pending_shipment"
        # Status ID 1000 = Ready to send
        elif sendcloud_status_id == 1000:
            return "label_created"

    # If no mapping found, log and return None
    logger.warning(
        f"Unmapped SendCloud status: {sendcloud_status_message} (ID: {sendcloud_status_id})"
    )
    return None


def _verify_webhook_signature(request_body, signature_header):
    """
    Verify the webhook signature from SendCloud.

    Args:
        request_body: Raw request body (bytes)
        signature_header: Signature from request header (if provided)

    Returns:
        bool: True if signature is valid or verification is disabled, False otherwise
    """
    webhook_secret = getattr(settings, "SENDCLOUD_WEBHOOK_SECRET", "")

    # If no secret is configured, skip verification (for development/testing)
    if not webhook_secret:
        logger.debug(
            "SENDCLOUD_WEBHOOK_SECRET not configured, skipping signature verification"
        )
        return True

    # If secret is configured but no signature provided, reject
    if not signature_header:
        logger.warning("Webhook secret configured but no signature header provided")
        return False

    # Compute expected signature
    # SendCloud typically uses HMAC-SHA256
    expected_signature = hmac.new(
        webhook_secret.encode("utf-8"), request_body, hashlib.sha256
    ).hexdigest()

    # Compare signatures (use constant-time comparison to prevent timing attacks)
    return hmac.compare_digest(expected_signature, signature_header)


@csrf_exempt
@require_POST
def sendcloud_webhook(request):
    """
    Handle SendCloud webhook notifications for parcel status changes.

    This endpoint receives POST requests from SendCloud when parcel status changes.
    It updates the corresponding order's shipping status in our database.

    POST /api/shipping/webhook/

    Headers:
        X-Sendcloud-Signature (optional): HMAC-SHA256 signature for webhook verification

    Expected payload structure (from SendCloud):
    {
        "parcel": {
            "id": 12345,
            "tracking_number": "ABC123",
            "status": {
                "id": 1000,
                "message": "Ready to send"
            },
            ...
        }
    }

    Returns:
        HttpResponse: 200 OK if processed successfully, 400/401/500 for errors
    """
    from api.models import Order

    try:
        # Verify webhook signature if configured
        signature_header = request.META.get("HTTP_X_SENDCLOUD_SIGNATURE", "")
        if not _verify_webhook_signature(request.body, signature_header):
            logger.warning(
                f"Invalid webhook signature. Request from IP: {request.META.get('REMOTE_ADDR', 'unknown')}"
            )
            return HttpResponse(status=401)

        # Parse JSON payload
        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in SendCloud webhook: {e}")
            return HttpResponse(status=400)

        # Extract parcel information
        parcel = payload.get("parcel") or payload.get("data", {}).get("parcel")
        if not parcel:
            logger.error(f"Missing parcel data in webhook payload: {payload}")
            return HttpResponse(status=400)

        parcel_id = parcel.get("id")
        if not parcel_id:
            logger.error(f"Missing parcel ID in webhook payload: {parcel}")
            return HttpResponse(status=400)

        # Extract status information
        status_info = parcel.get("status", {})
        status_message = status_info.get("message", "")
        status_id = status_info.get("id")

        # Extract tracking information
        tracking_number = parcel.get("tracking_number")
        tracking_url = parcel.get("tracking_url")

        logger.info(
            f"Received SendCloud webhook for parcel {parcel_id}: "
            f"status={status_message} (ID: {status_id})"
        )

        # Find the order by sendcloud_parcel_id
        try:
            order = Order.objects.select_related("shipping_details").get(
                shipping_details__sendcloud_parcel_id=parcel_id
            )
        except Order.DoesNotExist:
            logger.warning(
                f"No order found with sendcloud_parcel_id={parcel_id}. "
                f"This may be a parcel created outside our system."
            )
            # Return 200 to prevent SendCloud from retrying
            return HttpResponse(status=200)

        # Get or create shipping details
        details = order.ensure_shipping_details()

        # Map SendCloud status to our shipping_status
        new_shipping_status = _map_sendcloud_status_to_shipping_status(
            status_message, status_id
        )

        # Update shipping details
        update_fields = []

        if new_shipping_status and details.shipping_status != new_shipping_status:
            old_status = details.shipping_status
            details.shipping_status = new_shipping_status
            update_fields.append("shipping_status")
            logger.info(
                f"Updated order {order.id} shipping status: "
                f"{old_status} -> {new_shipping_status}"
            )

        # Update tracking number if provided and different
        if tracking_number and details.shipping_tracking_number != tracking_number:
            details.shipping_tracking_number = tracking_number
            update_fields.append("shipping_tracking_number")
            logger.info(f"Updated order {order.id} tracking number: {tracking_number}")

        # Update tracking URL if provided and different
        if tracking_url and details.shipping_tracking_url != tracking_url:
            details.shipping_tracking_url = tracking_url
            update_fields.append("shipping_tracking_url")

        # Clear error message if status is no longer failed
        if (
            new_shipping_status
            and new_shipping_status != "shipment_failed"
            and details.shipping_error_message
        ):
            details.shipping_error_message = None
            update_fields.append("shipping_error_message")

        # Save if there are updates
        if update_fields:
            details.save(update_fields=update_fields)
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
        # Return 500 so SendCloud will retry
        return HttpResponse(status=500)
