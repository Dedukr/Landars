"""
Shipping API Views

Provides REST API endpoints for:
- Getting shipping options
- Creating shipments
- Checking shipment status
"""

import logging
from decimal import Decimal

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
                    "error": f"Missing required address fields: {', '.join(missing_fields)}"
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get shipping options using the service
        service = ShippingService()
        options = service.get_shipping_options(address=address, items=items)
        
        # Log the options for debugging
        logger.info(f"Returning {len(options)} shipping options to frontend")
        if options:
            logger.debug(f"First option: {options[0]}")
        
        return Response({
            "success": True,
            "options": options
        })
        
    except SendcloudAPIError as e:
        logger.error(f"Sendcloud API error: {e}")
        return Response(
            {
                "success": False,
                "error": "Failed to retrieve shipping options. Please try again later."
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
        
    except Exception as e:
        logger.error(f"Unexpected error in get_shipping_options: {e}", exc_info=True)
        return Response(
            {
                "success": False,
                "error": "An unexpected error occurred."
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
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
                    "error": "Both order_id and shipping_method_id are required."
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get the order
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": f"Order with id {order_id} not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Verify order belongs to requesting user or user is staff
        if order.customer != request.user and not request.user.is_staff:
            return Response(
                {
                    "success": False,
                    "error": "You don't have permission to create shipment for this order."
                },
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Verify order is paid
        if order.payment_status != "succeeded":
            return Response(
                {
                    "success": False,
                    "error": "Order must be paid before creating shipment."
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create shipment
        service = ShippingService()
        shipment = service.create_shipment(order, shipping_method_id)
        
        # Update order with shipment details
        order.shipping_tracking_number = shipment.get("tracking_number")
        order.shipping_tracking_url = shipment.get("tracking_url")
        order.shipping_label_url = shipment.get("label_url")
        order.sendcloud_parcel_id = shipment.get("parcel_id")
        order.save(update_fields=[
            "shipping_tracking_number",
            "shipping_tracking_url", 
            "shipping_label_url",
            "sendcloud_parcel_id"
        ])
        
        return Response({
            "success": True,
            "shipment": shipment
        })
        
    except SendcloudAPIError as e:
        logger.error(f"Sendcloud API error: {e}")
        return Response(
            {
                "success": False,
                "error": "Failed to create shipment. Please try again later."
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
        
    except Exception as e:
        logger.error(f"Unexpected error in create_shipment: {e}", exc_info=True)
        return Response(
            {
                "success": False,
                "error": "An unexpected error occurred."
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
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
    try:
        service = ShippingService()
        shipment_status = service.get_shipment_status(int(parcel_id))
        
        return Response({
            "success": True,
            "shipment": shipment_status
        })
        
    except SendcloudAPIError as e:
        logger.error(f"Sendcloud API error: {e}")
        return Response(
            {
                "success": False,
                "error": "Failed to retrieve shipment status."
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
        
    except Exception as e:
        logger.error(f"Unexpected error in get_shipment_status: {e}", exc_info=True)
        return Response(
            {
                "success": False,
                "error": "An unexpected error occurred."
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

