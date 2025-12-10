"""
Stripe payment processing views
"""

import json
import logging

import stripe
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_POST
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

logger = logging.getLogger(__name__)

# Configure Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_payment_intent(request):
    """
    Create a Stripe Payment Intent for the order
    """
    try:
        data = request.data
        amount = data.get("amount")  # Amount in cents
        currency = data.get("currency", "gbp")
        metadata = data.get("metadata", {})

        # Validate amount
        if not amount or amount <= 0:
            return Response(
                {"error": "Invalid amount"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Create payment intent
        payment_intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            metadata={
                "user_id": str(request.user.id),
                "user_email": request.user.email,
                **metadata,
            },
            automatic_payment_methods={
                "enabled": True,
            },
        )

        logger.info(
            f"Payment intent created: {payment_intent.id} for user: {request.user.email}"
        )

        return Response(
            {
                "client_secret": payment_intent.client_secret,
                "payment_intent_id": payment_intent.id,
            },
            status=status.HTTP_201_CREATED,
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating payment intent: {str(e)}")
        return Response(
            {"error": f"Payment processing error: {str(e)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.error(f"Error creating payment intent: {str(e)}")
        return Response(
            {"error": "Internal server error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@csrf_exempt
@require_POST
def stripe_webhook(request):
    """
    Handle Stripe webhook events
    """
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")
    endpoint_secret = settings.STRIPE_WEBHOOK_SECRET

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except ValueError as e:
        logger.error(f"Invalid payload: {str(e)}")
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Invalid signature: {str(e)}")
        return HttpResponse(status=400)

    # Handle the event
    if event["type"] == "payment_intent.succeeded":
        payment_intent = event["data"]["object"]
        payment_intent_id = payment_intent["id"]
        logger.info(f"Payment succeeded: {payment_intent_id}")

        # Find order with this payment intent ID
        from shipping.service import ShippingService

        from .models import Order

        try:
            order = Order.objects.get(payment_intent_id=payment_intent_id)

            # Update order status to paid if not already
            if order.status != "paid":
                order.status = "paid"
                order.payment_status = "succeeded"
                order.save(update_fields=["status", "payment_status"])
                logger.info(f"Updated order {order.id} status to paid")

            # Trigger shipment creation if order has shipping method
            details = getattr(order, "shipping_details", None)
            if details and details.shipping_method_id:
                try:
                    shipping_service = ShippingService()
                    result = shipping_service.create_shipment_for_order(order)

                    if result.get("success"):
                        logger.info(
                            f"Shipment created via webhook for order {order.id}: "
                            f"tracking={result.get('tracking_number')}"
                        )
                    else:
                        logger.warning(
                            f"Failed to create shipment via webhook for order {order.id}: "
                            f"{result.get('error')}"
                        )
                except Exception as e:
                    logger.error(
                        f"Exception while creating shipment via webhook for order {order.id}: {e}",
                        exc_info=True,
                    )
            else:
                logger.info(
                    f"Order {order.id} does not have a shipping method, skipping shipment creation"
                )

        except Order.DoesNotExist:
            logger.warning(
                f"No order found with payment_intent_id: {payment_intent_id}"
            )
        except Exception as e:
            logger.error(
                f"Error processing payment_intent.succeeded webhook: {e}", exc_info=True
            )

    elif event["type"] == "payment_intent.payment_failed":
        payment_intent = event["data"]["object"]
        logger.error(f"Payment failed: {payment_intent['id']}")

        # Handle failed payment
        # Update order status to failed

    elif event["type"] == "payment_intent.canceled":
        payment_intent = event["data"]["object"]
        logger.info(f"Payment canceled: {payment_intent['id']}")

        # Handle canceled payment

    else:
        logger.info(f"Unhandled event type: {event['type']}")

    return HttpResponse(status=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_payment_intent_status(request, payment_intent_id):
    """
    Get the status of a payment intent
    """
    try:
        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)

        return Response(
            {
                "id": payment_intent.id,
                "status": payment_intent.status,
                "amount": payment_intent.amount,
                "currency": payment_intent.currency,
                "created": payment_intent.created,
            }
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error retrieving payment intent: {str(e)}")
        return Response(
            {"error": f"Error retrieving payment: {str(e)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.error(f"Error retrieving payment intent: {str(e)}")
        return Response(
            {"error": "Internal server error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_customer(request):
    """
    Create a Stripe customer for the user
    """
    try:
        customer = stripe.Customer.create(
            email=request.user.email,
            name=request.user.name,
            metadata={
                "user_id": str(request.user.id),
            },
        )

        # Store customer ID in user profile if needed
        # You might want to add a stripe_customer_id field to your user model

        return Response(
            {
                "customer_id": customer.id,
            },
            status=status.HTTP_201_CREATED,
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating customer: {str(e)}")
        return Response(
            {"error": f"Error creating customer: {str(e)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.error(f"Error creating customer: {str(e)}")
        return Response(
            {"error": "Internal server error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
