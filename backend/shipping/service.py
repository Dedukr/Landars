"""
Shipping Service Layer

This module provides high-level shipping functionality:
- Normalizes shipping data between internal format and Sendcloud format
- Calculates parcel weight from order items
- Retrieves and formats shipping options
- Handles shipment creation
"""

import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from django.conf import settings

from .sendcloud_client import SendcloudAPIError, SendcloudClient

logger = logging.getLogger(__name__)

# Preassigned delivery fee map based on Royal Mail prices
# Maps weight ranges (in kg) to delivery fees (in GBP)
ROYAL_MAIL_DELIVERY_FEE_MAP = {
    # Weight range: (min_kg, max_kg): price_gbp
    (0.0, 5.0): Decimal("4.44"),  # Medium Parcel 0-5kg
    (5.0, 10.0): Decimal("5.82"),  # Medium Parcel 5-10kg
    (10.0, 20.0): Decimal("9.25"),  # 10-20kg delivery
    # No service above 20kg – handled explicitly in code
}

# Alternative format: weight threshold to price mapping
# This is easier to use for lookup: if weight <= threshold, use this price
ROYAL_MAIL_DELIVERY_FEE_BY_WEIGHT = {
    5.0: Decimal("4.44"),  # 0-5kg: Medium Parcel 0-5kg
    10.0: Decimal("5.82"),  # 5-10kg: Medium Parcel 5-10kg
    20.0: Decimal("9.25"),  # 10-20kg: Delivery
    # No option above 20kg
}


class ShippingService:
    """
    Service layer for shipping operations.

    Abstracts Sendcloud API details and provides a clean interface
    for the rest of the application.
    """

    def __init__(self):
        """Initialize the shipping service with Sendcloud client."""
        try:
            self.client = SendcloudClient()
        except ValueError as e:
            logger.warning(f"Sendcloud client not configured: {e}")
            self.client = None

    @staticmethod
    def get_delivery_fee_by_weight(weight: float) -> Decimal:
        """
        Get preassigned delivery fee based on parcel weight.

        Uses the ROYAL_MAIL_DELIVERY_FEE_BY_WEIGHT map to determine
        the appropriate delivery fee for a given weight.

        Args:
            weight: Parcel weight in kilograms

        Returns:
            Delivery fee as Decimal in GBP
        """
        # Ensure minimum weight
        weight = max(weight, 0.1)

        # If weight exceeds supported range, return 0 to signal no available option
        if weight > 20:
            logger.warning(
                "No delivery option available for weight %.2fkg (above 20kg limit)",
                weight,
            )
            return Decimal("0.00")

        # Reference module-level constant directly
        # Find the appropriate price tier
        for threshold, price in sorted(ROYAL_MAIL_DELIVERY_FEE_BY_WEIGHT.items()):
            if weight <= threshold:
                return price

        # Fallback should never be hit because >20kg is handled above
        return Decimal("0.00")

    def _calculate_parcel_weight(self, items: List[Dict[str, Any]]) -> float:
        """
        Calculate total weight of parcel from order items.

        For now, we use quantity as weight approximation (kg).
        In production, you'd want to add a weight field to Product model.

        Args:
            items: List of order items with 'product' and 'quantity' keys

        Returns:
            Total weight in kilograms
        """
        total_weight = 0.0

        for item in items:
            quantity = float(item.get("quantity", 0))
            # TODO: Use actual product weight when Product.weight field is added
            # For now, assume 1kg per unit (modify based on your products)
            product_weight = 1.0
            total_weight += quantity * product_weight

        return max(total_weight, 0.1)  # Minimum 0.1kg

    def _get_carrier_logo_url(self, carrier_code: str) -> str:
        """
        Get carrier logo URL based on carrier code.

        Args:
            carrier_code: Sendcloud carrier code (e.g., "royal_mailv2", "dpd")

        Returns:
            Logo URL or empty string if not available
        """
        # Mapping of carrier codes to logo URLs
        # Using reliable public CDN sources for carrier logos
        logo_mapping = {
            "royal_mail": "https://logos-world.net/wp-content/uploads/2021/02/Royal-Mail-Logo.png",
            "royal_mailv2": "https://logos-world.net/wp-content/uploads/2021/02/Royal-Mail-Logo.png",
            "dpd": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/DPD_logo.svg/320px-DPD_logo.svg.png",
            "dpd_gb": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/DPD_logo.svg/320px-DPD_logo.svg.png",
            "evri": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Evri_logo.svg/320px-Evri_logo.svg.png",
            "hermes_c2c_gb": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Evri_logo.svg/320px-Evri_logo.svg.png",
            "ups": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/UPS_logo_2014.svg/320px-UPS_logo_2014.svg.png",
            "dhl": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/DHL_Logo.svg/320px-DHL_Logo.svg.png",
            "inpost_gb": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/InPost_logo.svg/320px-InPost_logo.svg.png",
            "parcelforce": "https://upload.wikimedia.org/wikipedia/en/thumb/8/87/Parcelforce_Worldwide_logo.svg/320px-Parcelforce_Worldwide_logo.svg.png",
        }

        return logo_mapping.get(carrier_code.lower(), "")

    def _normalize_shipping_option(self, method: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert Sendcloud shipping method to normalized format.

        Args:
            method: Raw shipping method data from Sendcloud

        Returns:
            Normalized shipping option dictionary
        """
        # Sendcloud API may return price in different formats
        # Check for 'price' field directly or in nested structures
        price = method.get("price")

        # If no price, check for carrier-specific pricing
        if not price and "carrier" in method:
            carrier_data = method.get("carrier", {})
            if isinstance(carrier_data, dict):
                price = carrier_data.get("price")

        # Log the raw method data to help debug (first time only)
        logger.debug(f"Raw Sendcloud method: {method}")

        # If still no price after API call, log error (should not happen in production)
        if not price or str(price) in ["0", "0.00", "0.0"]:
            carrier = str(method.get("carrier", ""))
            service_name = str(method.get("name", ""))

            logger.error(
                f"No price available for shipping method: {carrier} - {service_name}. "
                f"Please configure pricing in your Sendcloud panel or check your carrier contracts."
            )
            # Return 0 to indicate pricing unavailable - frontend can filter these out
            price = "0.00"

        carrier_code = method.get("carrier", "Unknown")

        return {
            "id": method.get("id"),
            "carrier": carrier_code,
            "name": method.get("name", "Standard Shipping"),
            "service_point_input": method.get("service_point_input", "none"),
            # Sendcloud returns prices as strings or can be null
            "price": self._parse_price(price),
            "currency": method.get("currency", "GBP"),
            # Delivery time information
            "min_delivery_days": method.get("min_delivery_days"),
            "max_delivery_days": method.get("max_delivery_days"),
            # Additional useful fields
            "countries": method.get("countries", []),
            "properties": method.get("properties", {}),
            # Add carrier logo URL
            "logo_url": self._get_carrier_logo_url(carrier_code),
        }

    def _parse_price(self, price_value: Any) -> str:
        """
        Parse price value to decimal string.

        Args:
            price_value: Price as string, number, or None

        Returns:
            Price as decimal string (e.g., "5.99")
        """
        if price_value is None:
            return "0.00"

        try:
            return f"{Decimal(str(price_value)):.2f}"
        except (ValueError, TypeError):
            logger.warning(f"Could not parse price: {price_value}")
            return "0.00"

    def get_shipping_options(
        self,
        address: Dict[str, str],
        items: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get available shipping options with prices for an address and order items.

        Args:
            address: Shipping address dictionary with keys:
                - country: Country code (e.g., "GB")
                - postal_code: Postal code
                - city: City name
                - address_line: Street address
            items: List of order items (used for weight calculation)

        Returns:
            List of normalized shipping options with accurate prices

        Raises:
            ValueError: If required address fields are missing
            SendcloudAPIError: If Sendcloud API request fails
        """
        if not self.client:
            raise SendcloudAPIError("Sendcloud client not configured")

        # Validate required address fields
        required_fields = ["country", "postal_code"]
        missing_fields = [f for f in required_fields if not address.get(f)]
        if missing_fields:
            raise ValueError(f"Missing required address fields: {missing_fields}")

        # Calculate weight from items if provided
        weight = self._calculate_parcel_weight(items) if items else 1.0

        try:
            # Get shipping methods from Sendcloud
            methods = self.client.get_shipping_methods(
                to_country=address["country"],
                to_postal_code=address.get("postal_code"),
                weight=weight,
                weight_unit="kilogram",
            )

            # Filter methods based on configuration (normalize/strip for reliable matching)
            allowed_carriers = [
                c.strip().lower()
                for c in getattr(
                    settings,
                    "SENDCLOUD_ALLOWED_CARRIERS",
                    ["royal_mail", "royal_mailv2"],
                )
                if c and c.strip()
            ]
            allowed_services = [
                s.strip().lower()
                for s in getattr(settings, "SENDCLOUD_ALLOWED_SERVICES", ["tracked 48"])
                if s and s.strip()
            ]
            exclude_services = [
                s.strip().lower()
                for s in getattr(
                    settings,
                    "SENDCLOUD_EXCLUDE_SERVICES",
                    ["signed", "tracked 24", "express", "large letter"],
                )
                if s and s.strip()
            ]

            filtered_methods = []
            for method in methods:
                carrier = str(method.get("carrier", "")).lower()
                service_name = str(method.get("name", "")).lower()

                # Check if carrier is allowed
                if not any(
                    allowed_carrier in carrier for allowed_carrier in allowed_carriers
                ):
                    logger.debug(f"Excluding {carrier} - not in allowed carriers")
                    continue

                # Check if service name contains any allowed service
                if allowed_services and not any(
                    allowed_svc.lower() in service_name
                    for allowed_svc in allowed_services
                ):
                    logger.debug(f"Excluding {service_name} - not in allowed services")
                    continue

                # Check if service name contains any excluded service
                if any(
                    excluded_svc.lower() in service_name
                    for excluded_svc in exclude_services
                ):
                    logger.debug(f"Excluding {service_name} - in excluded services")
                    continue

                # Weight-based filtering - only show methods that support the parcel weight
                min_weight = method.get("min_weight")
                max_weight = method.get("max_weight")

                if min_weight is not None and max_weight is not None:
                    try:
                        min_weight_float = float(min_weight)
                        max_weight_float = float(max_weight)

                        # Only include if weight falls within this method's range
                        # Add small buffer to handle edge cases
                        if weight < (min_weight_float - 0.001) or weight > (
                            max_weight_float + 0.001
                        ):
                            logger.debug(
                                f"Excluding {service_name} - weight {weight}kg not in range "
                                f"{min_weight_float}-{max_weight_float}kg"
                            )
                            continue
                    except (ValueError, TypeError):
                        # If we can't parse weight limits, include the method
                        pass

                filtered_methods.append(method)

            # Sort by min_weight to get smallest option first, then take only the first one
            if filtered_methods:
                filtered_methods.sort(key=lambda m: float(m.get("min_weight", 0)))
                # Keep only the smallest option that fits the weight
                filtered_methods = [filtered_methods[0]]
                logger.info(
                    f"Selected smallest shipping option: {filtered_methods[0].get('name')} "
                    f"(weight range: {filtered_methods[0].get('min_weight')}-{filtered_methods[0].get('max_weight')}kg) "
                    f"for order weight: {weight}kg"
                )
            else:
                logger.warning(
                    f"No shipping options found for weight {weight}kg "
                    f"(carriers: {allowed_carriers}, services: {allowed_services})"
                )

            # Fetch prices for filtered methods
            normalized_options = []
            destination_country = address["country"].upper()

            for method in filtered_methods:
                method_id = method.get("id")
                carrier = method.get("carrier", "").lower()
                service_name = method.get("name", "")
                is_royal_mail = "royal_mail" in carrier

                # Log Royal Mail methods specifically
                if is_royal_mail:
                    logger.info(
                        f"Fetching price for Royal Mail service: {service_name} "
                        f"(method_id: {method_id}, carrier: {carrier})"
                    )

                # First, try to get price from the countries array in the method
                price_from_countries = None
                countries = method.get("countries", [])
                for country_info in countries:
                    if country_info.get("iso_2") == destination_country:
                        price_from_countries = country_info.get("price")
                        break

                # If we found a price in countries array, use it
                if price_from_countries:
                    method["price"] = str(price_from_countries)
                    method["currency"] = "GBP"  # UK pricing
                    if is_royal_mail:
                        logger.info(
                            f"Royal Mail price from countries array: {price_from_countries} GBP "
                            f"for {service_name}"
                        )
                else:
                    # Try to get price from Sendcloud pricing API
                    if is_royal_mail:
                        logger.info(
                            f"Fetching Royal Mail price from Sendcloud API for method {method_id}, "
                            f"destination: {address['country']} {address.get('postal_code', '')}, "
                            f"weight: {weight}kg"
                        )

                    price_data = self.client.get_shipping_price(
                        shipping_method_id=method_id,
                        to_country=address["country"],
                        to_postal_code=address["postal_code"],
                        weight=weight,
                    )

                    # Add price data to method if available
                    if price_data and "price" in price_data:
                        method["price"] = price_data["price"]
                        method["currency"] = price_data.get("currency", "GBP")
                        if is_royal_mail:
                            logger.info(
                                f"Royal Mail price from API: {price_data['price']} {price_data.get('currency', 'GBP')} "
                                f"for {service_name}"
                            )
                    elif is_royal_mail:
                        logger.warning(
                            f"No price data returned from Sendcloud API for Royal Mail method {method_id} "
                            f"({service_name}). Response: {price_data}"
                        )

                normalized = self._normalize_shipping_option(method)

                # Only include options with valid pricing
                if normalized["price"] != "0.00":
                    normalized_options.append(normalized)
                    if is_royal_mail:
                        logger.info(
                            f"Royal Mail option included: {service_name} - "
                            f"£{normalized['price']} (method_id: {method_id})"
                        )
                else:
                    logger.warning(
                        f"Excluding shipping option {method.get('carrier')} - {method.get('name')} "
                        f"(no pricing configured for {destination_country})"
                    )
                    if is_royal_mail:
                        logger.error(
                            f"Royal Mail service {service_name} excluded due to missing price. "
                            f"Please check Sendcloud configuration for Royal Mail pricing."
                        )

            logger.info(
                f"Found {len(normalized_options)} shipping options with pricing"
            )
            return normalized_options

        except SendcloudAPIError as e:
            logger.error(f"Failed to get shipping options: {e}")
            raise

    def create_shipment(
        self,
        order: Any,  # Order model instance
        shipping_method_id: int,
    ) -> Dict[str, Any]:
        """
        Create a shipment for an order using Sendcloud.

        Args:
            order: Order model instance with address and items
            shipping_method_id: ID of selected Sendcloud shipping method

        Returns:
            Shipment data including tracking number and label URL

        Raises:
            ValueError: If order data is invalid
            SendcloudAPIError: If shipment creation fails
        """
        if not self.client:
            raise SendcloudAPIError("Sendcloud client not configured")

        # Validate order has required data
        if not order.address:
            raise ValueError("Order must have a shipping address")

        address = order.address

        # Prepare parcel items for Sendcloud
        parcel_items = []
        for item in order.items.all():
            # Use stored item name if product is deleted, otherwise use product name
            item_name = item.item_name if item.item_name else (
                item.product.name if item.product else "Deleted product"
            )
            # Only include items that have a name (skip completely invalid items)
            if item_name and item_name != "Deleted product":
                parcel_items.append(
                    {
                        "description": item_name,
                        "quantity": int(item.quantity),
                        "weight": str(float(item.quantity)),  # TODO: use actual weight
                        "value": str(item.get_total_price()),
                    }
                )

        # Calculate total weight
        items_data = [{"quantity": item.quantity} for item in order.items.all()]
        weight = self._calculate_parcel_weight(items_data)

        # Get customer name and phone from user profile
        customer_name = order.customer.name if order.customer else "Customer"
        customer_phone = ""
        if (
            order.customer
            and hasattr(order.customer, "profile")
            and order.customer.profile
        ):
            customer_phone = order.customer.profile.phone or ""

        try:
            # Create parcel with Sendcloud
            parcel = self.client.create_parcel(
                name=customer_name,
                address=address.address_line,
                address_2=address.address_line2 or "",
                city=address.city,
                postal_code=address.postal_code,
                country=address.country or "GB",
                email=order.customer.email if order.customer else "",
                phone=customer_phone,
                shipping_method_id=shipping_method_id,
                weight=str(weight),
                order_number=str(order.id),
                parcel_items=parcel_items,
            )

            return {
                "parcel_id": parcel.get("id"),
                "tracking_number": parcel.get("tracking_number"),
                "tracking_url": parcel.get("tracking_url"),
                "label_url": parcel.get("label", {}).get("normal_printer", [None])[0],
                "carrier": parcel.get("carrier", {}).get("code"),
                "status": parcel.get("status", {}).get("message"),
            }

        except SendcloudAPIError as e:
            logger.error(f"Failed to create shipment for order {order.id}: {e}")
            raise

    def get_shipment_status(self, parcel_id: int) -> Dict[str, Any]:
        """
        Get the current status of a shipment.

        Args:
            parcel_id: Sendcloud parcel ID

        Returns:
            Shipment status information
        """
        if not self.client:
            raise SendcloudAPIError("Sendcloud client not configured")

        try:
            parcel = self.client.get_parcel(parcel_id)
            return {
                "parcel_id": parcel.get("id"),
                "tracking_number": parcel.get("tracking_number"),
                "status": parcel.get("status", {}).get("message"),
                "carrier": parcel.get("carrier", {}).get("code"),
            }
        except SendcloudAPIError as e:
            logger.error(f"Failed to get shipment status for parcel {parcel_id}: {e}")
            raise

    def cancel_shipment(self, parcel_id: int) -> bool:
        """
        Cancel a shipment.

        Args:
            parcel_id: Sendcloud parcel ID

        Returns:
            True if cancelled successfully, False otherwise
        """
        if not self.client:
            raise SendcloudAPIError("Sendcloud client not configured")

        return self.client.cancel_parcel(parcel_id)

    def create_shipment_for_order(self, order: Any) -> Dict[str, Any]:
        """
        Create a shipment for an order in an idempotent way.

        This function:
        - Checks if a shipment already exists for the order
        - Creates a new shipment if one doesn't exist
        - Updates the order with tracking information
        - Handles errors gracefully and logs them

        Args:
            order: Order model instance

        Returns:
            Dictionary with shipment result:
            {
                "success": bool,
                "parcel_id": int,
                "tracking_number": str,
                "tracking_url": str,
                "label_url": str,
                "carrier": str,
                "status": str,
                "error": str (if failed)
            }
        """
        from django.db import transaction

        # Use select_for_update to prevent race conditions
        with transaction.atomic():
            # Lock the order row to prevent concurrent shipment creation
            locked_order = type(order).objects.select_for_update().get(pk=order.pk)
            details = locked_order.ensure_shipping_details()

            # Check if shipment already exists (idempotency check)
            if details.sendcloud_parcel_id:
                logger.info(
                    f"Shipment already exists for order {locked_order.id} "
                    f"(parcel_id: {details.sendcloud_parcel_id})"
                )
                return {
                    "success": True,
                    "parcel_id": details.sendcloud_parcel_id,
                    "tracking_number": details.shipping_tracking_number,
                    "tracking_url": details.shipping_tracking_url,
                    "label_url": details.shipping_label_url,
                    "carrier": details.shipping_carrier,
                    "status": details.shipping_status or "label_created",
                    "already_exists": True,
                }

            # Validate order has required data
            if not details.shipping_method_id:
                error_msg = "Order does not have a shipping method selected"
                logger.error(
                    f"Cannot create shipment for order {locked_order.id}: {error_msg}"
                )
                details.shipping_status = "shipment_failed"
                details.shipping_error_message = error_msg
                details.save(
                    update_fields=["shipping_status", "shipping_error_message"]
                )
                return {
                    "success": False,
                    "error": error_msg,
                }

            if not locked_order.address:
                error_msg = "Order does not have a shipping address"
                logger.error(
                    f"Cannot create shipment for order {locked_order.id}: {error_msg}"
                )
                details.shipping_status = "shipment_failed"
                details.shipping_error_message = error_msg
                details.save(
                    update_fields=["shipping_status", "shipping_error_message"]
                )
                return {
                    "success": False,
                    "error": error_msg,
                }

            try:
                logger.info(
                    f"Creating shipment for order {locked_order.id} with "
                    f"shipping method {details.shipping_method_id}"
                )

                # Create the shipment
                shipment_data = self.create_shipment(
                    order=locked_order,
                    shipping_method_id=details.shipping_method_id,
                )

                # Update order with shipment information
                details.sendcloud_parcel_id = shipment_data.get("parcel_id")
                details.shipping_tracking_number = shipment_data.get("tracking_number")
                details.shipping_tracking_url = shipment_data.get("tracking_url")
                details.shipping_label_url = shipment_data.get("label_url")
                details.shipping_status = "label_created"
                details.shipping_error_message = None  # Clear any previous errors

                details.save(
                    update_fields=[
                        "sendcloud_parcel_id",
                        "shipping_tracking_number",
                        "shipping_tracking_url",
                        "shipping_label_url",
                        "shipping_status",
                        "shipping_error_message",
                    ]
                )

                logger.info(
                    f"Successfully created shipment for order {locked_order.id}: "
                    f"parcel_id={shipment_data.get('parcel_id')}, "
                    f"tracking={shipment_data.get('tracking_number')}"
                )

                return {
                    "success": True,
                    **shipment_data,
                }

            except SendcloudAPIError as e:
                error_msg = f"Sendcloud API error: {str(e)}"
                logger.error(
                    f"Failed to create shipment for order {locked_order.id}: {error_msg}"
                )

                # Update order with error information
                details.shipping_status = "shipment_failed"
                details.shipping_error_message = error_msg
                details.save(
                    update_fields=["shipping_status", "shipping_error_message"]
                )

                return {
                    "success": False,
                    "error": error_msg,
                }
            except Exception as e:
                error_msg = f"Unexpected error: {str(e)}"
                logger.error(
                    f"Failed to create shipment for order {locked_order.id}: {error_msg}",
                    exc_info=True,
                )

                # Update order with error information
                details.shipping_status = "shipment_failed"
                details.shipping_error_message = error_msg
                details.save(
                    update_fields=["shipping_status", "shipping_error_message"]
                )

                return {
                    "success": False,
                    "error": error_msg,
                }
