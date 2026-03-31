"""
Sendcloud API Client

This module handles all communication with the Sendcloud API.
It provides a clean interface for:
- Getting available shipping methods
- Creating shipments
- Getting shipping labels
"""

import base64
import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class SendcloudAPIError(Exception):
    """Custom exception for Sendcloud API errors"""

    pass


class SendcloudClient:
    """
    Client for interacting with the Sendcloud API.

    Documentation: https://docs.sendcloud.sc/api/v2/shipping/
    """

    BASE_URL = "https://panel.sendcloud.sc/api/v2"

    def __init__(
        self, public_key: Optional[str] = None, secret_key: Optional[str] = None
    ):
        """
        Initialize the Sendcloud client.

        Args:
            public_key: Sendcloud public key (defaults to settings.SENDCLOUD_PUBLIC_KEY)
            secret_key: Sendcloud secret key (defaults to settings.SENDCLOUD_SECRET_KEY)
        """
        self.public_key = public_key or getattr(settings, "SENDCLOUD_PUBLIC_KEY", "")
        self.secret_key = secret_key or getattr(settings, "SENDCLOUD_SECRET_KEY", "")

        if not self.public_key or not self.secret_key:
            raise ValueError(
                "Sendcloud API credentials not configured. "
                "Please set SENDCLOUD_PUBLIC_KEY and SENDCLOUD_SECRET_KEY in settings."
            )

    def _get_headers(self) -> Dict[str, str]:
        """
        Generate authentication headers for Sendcloud API requests.
        Uses HTTP Basic Authentication with base64 encoding.
        """
        credentials = f"{self.public_key}:{self.secret_key}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        return {
            "Authorization": f"Basic {encoded_credentials}",
            "Content-Type": "application/json",
        }

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Make a request to the Sendcloud API.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (e.g., "/shipping_methods")
            data: Request body data (for POST/PUT)
            params: URL query parameters

        Returns:
            Response data as dictionary

        Raises:
            SendcloudAPIError: If the request fails
        """
        url = f"{self.BASE_URL}{endpoint}"
        headers = self._get_headers()

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=data,
                params=params,
                timeout=30,
            )
            response.raise_for_status()
            return response.json()

        except requests.exceptions.HTTPError as e:
            error_message = f"Sendcloud API HTTP error: {e}"
            try:
                error_data = e.response.json()
                error_message += f" - {error_data}"
            except:
                pass
            logger.error(error_message)
            raise SendcloudAPIError(error_message) from e

        except requests.exceptions.RequestException as e:
            error_message = f"Sendcloud API request failed: {e}"
            logger.error(error_message)
            raise SendcloudAPIError(error_message) from e

    def get_shipping_methods(
        self,
        to_country: str,
        to_postal_code: Optional[str] = None,
        weight: Optional[float] = None,
        weight_unit: str = "kilogram",
        from_country: Optional[str] = None,
        from_postal_code: Optional[str] = None,
        sender_address_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get available shipping methods for a destination.

        Args:
            to_country: Destination country code (ISO 3166-1 alpha-2, e.g., "GB", "US")
            to_postal_code: Destination postal code
            weight: Parcel weight
            weight_unit: Weight unit ("kilogram" or "gram")
            from_country: Sender country code (defaults to settings.SENDCLOUD_SENDER_COUNTRY)
            from_postal_code: Sender postal code (defaults to settings.SENDCLOUD_SENDER_POSTAL_CODE)
            sender_address_id: Sendcloud sender address ID (optional query filter)

        Returns:
            List of shipping method dictionaries
        """
        params = {
            "to_country": to_country.upper(),
        }

        if to_postal_code:
            params["to_postal_code"] = to_postal_code

        if weight is not None:
            params["weight"] = weight
            params["weight_unit"] = weight_unit

        if from_country or hasattr(settings, "SENDCLOUD_SENDER_COUNTRY"):
            params["from_country"] = (
                from_country or settings.SENDCLOUD_SENDER_COUNTRY
            ).upper()

        if from_postal_code or hasattr(settings, "SENDCLOUD_SENDER_POSTAL_CODE"):
            params["from_postal_code"] = (
                from_postal_code or settings.SENDCLOUD_SENDER_POSTAL_CODE
            )

        if sender_address_id is not None:
            params["sender_address"] = sender_address_id

        try:
            response = self._make_request("GET", "/shipping_methods", params=params)
            shipping_methods = response.get("shipping_methods", [])

            # Log the raw response for debugging
            logger.info(f"Sendcloud returned {len(shipping_methods)} shipping methods")
            if shipping_methods:
                logger.debug(f"First shipping method sample: {shipping_methods[0]}")

            return shipping_methods
        except SendcloudAPIError as e:
            logger.error(f"Failed to get shipping methods: {e}")
            raise

    def create_parcel(
        self,
        name: str,
        address: str,
        city: str,
        postal_code: str,
        country: str,
        shipping_method_id: int,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        address_2: Optional[str] = None,
        weight: Optional[str] = None,
        order_number: Optional[str] = None,
        parcel_items: Optional[List[Dict[str, Any]]] = None,
        sender_address: Optional[int] = None,
        request_label: bool = True,
        total_order_value: Optional[str] = None,
        total_order_value_currency: str = "GBP",
        quantity: Optional[int] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        POST /parcels (v2): create parcel in one call with ``request_label: true``.

        Typical body includes recipient fields, ``shipment: {"id": <method_id>}``,
        ``sender_address``, weight, ``order_number``, ``parcel_items``,
        ``total_order_value``, ``total_order_value_currency``.

        **Parcel ``quantity``** (if passed) is the **multi-collo count** (number of
        physical packages in one shipment), *not* merchandise units. Values ``> 1``
        require Sendcloud's multi-parcel flow with ``request_label: true``. For one
        box containing the full order, omit ``quantity`` (defaults to 1) and put
        line **item** counts only inside ``parcel_items[].quantity``.

        The JSON response ``parcel`` object includes Sendcloud parcel id, carrier,
        tracking number, status, and label/document links when label creation succeeds.

        Args:
            name Recipient name
            address Street / house number line
            city City
            postal_code Postal code
            country Country code (ISO 3166-1 alpha-2)
            shipping_method_id Sendcloud shipping **method** id (parcel JSON key ``shipment.id``)
            email Recipient email
            phone Recipient phone
            address_2 Second address line
            weight Parcel weight in kg
            order_number Stable external reference (e.g. internal order / dispatch ref)
            parcel_items Line items for customs / manifest (per-item ``quantity`` is units of that SKU)
            quantity Optional. Multi-collo package count only; omit for single-parcel orders.
            **kwargs Additional parcel parameters forwarded into the parcel object

        Returns:
            The ``parcel`` dict from the API (id, tracking, label URLs, carrier, etc.)
        """
        parcel_data = {
            "name": name,
            "address": address,
            "city": city,
            "postal_code": postal_code,
            "country": country.upper(),
            "shipment": {"id": shipping_method_id},
        }

        if email:
            parcel_data["email"] = email
        if phone:
            parcel_data["telephone"] = phone
        if address_2:
            parcel_data["address_2"] = address_2
        if weight:
            parcel_data["weight"] = str(weight)
        if order_number:
            parcel_data["order_number"] = str(order_number)
        if parcel_items:
            parcel_data["parcel_items"] = parcel_items
        if sender_address is not None:
            parcel_data["sender_address"] = int(sender_address)
        parcel_data["request_label"] = request_label
        if total_order_value is not None:
            parcel_data["total_order_value"] = str(total_order_value)
        if total_order_value_currency:
            parcel_data["total_order_value_currency"] = total_order_value_currency
        if quantity is not None:
            parcel_data["quantity"] = int(quantity)

        # Add any additional parameters
        parcel_data.update(kwargs)

        try:
            response = self._make_request(
                "POST", "/parcels", data={"parcel": parcel_data}
            )
            return response.get("parcel", {})
        except SendcloudAPIError as e:
            logger.error(f"Failed to create parcel: {e}")
            raise

    def download_url(self, url: str) -> bytes:
        """Download binary content (e.g. label PDF) using the same Basic auth as the API."""
        headers = self._get_headers()
        try:
            response = requests.get(url, headers=headers, timeout=60)
            response.raise_for_status()
            return response.content
        except requests.exceptions.RequestException as e:
            msg = f"Failed to download Sendcloud URL: {e}"
            logger.error(msg)
            raise SendcloudAPIError(msg) from e

    def get_parcel(self, parcel_id: int) -> Dict[str, Any]:
        """
        Get parcel details by ID.

        Args:
            parcel_id: Sendcloud parcel ID

        Returns:
            Parcel data
        """
        try:
            response = self._make_request("GET", f"/parcels/{parcel_id}")
            return response.get("parcel", {})
        except SendcloudAPIError as e:
            logger.error(f"Failed to get parcel {parcel_id}: {e}")
            raise

    def list_parcels(
        self,
        params: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        GET /parcels — optional filters e.g. ``order_number``, ``tracking_number``,
        ``external_reference`` (Sendcloud v2 docs).
        """
        clean: Dict[str, Any] = {}
        if params:
            for k, v in params.items():
                if v is None or v == "":
                    continue
                clean[k] = v
        try:
            response = self._make_request(
                "GET", "/parcels", params=clean or None
            )
            parcels = response.get("parcels")
            if isinstance(parcels, list):
                return parcels
            return []
        except SendcloudAPIError as e:
            logger.error("Failed to list parcels: %s", e)
            raise

    def get_labels_for_parcel(self, parcel_id: int) -> Dict[str, Any]:
        """
        GET /labels/{parcel_id} — fresh label PDF URLs (and optional customs_declaration).

        Use after create when embedded links are missing or stale, or to re-fetch later.
        """
        try:
            response = self._make_request("GET", f"/labels/{parcel_id}")
            return response if isinstance(response, dict) else {}
        except SendcloudAPIError as e:
            logger.error(f"Failed to get labels for parcel {parcel_id}: {e}")
            raise

    def cancel_parcel(self, parcel_id: int) -> bool:
        """
        Cancel a parcel.

        Args:
            parcel_id: Sendcloud parcel ID

        Returns:
            True if cancelled successfully
        """
        try:
            self._make_request("POST", f"/parcels/{parcel_id}/cancel")
            return True
        except SendcloudAPIError as e:
            logger.error(f"Failed to cancel parcel {parcel_id}: {e}")
            return False

    def get_shipping_price(
        self,
        shipping_method_id: int,
        to_country: str,
        to_postal_code: str,
        weight: float,
        from_country: Optional[str] = None,
        from_postal_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get shipping price for a specific method and destination.

        Args:
            shipping_method_id: Sendcloud shipping method ID
            to_country: Destination country code (ISO 3166-1 alpha-2)
            to_postal_code: Destination postal code
            weight: Parcel weight in kg
            from_country: Sender country code
            from_postal_code: Sender postal code

        Returns:
            Price information dictionary or None if not available
        """
        params = {
            "shipping_method": shipping_method_id,
            "to_country": to_country.upper(),
            "to_postal_code": to_postal_code,
            "weight": weight,
        }

        if from_country or hasattr(settings, "SENDCLOUD_SENDER_COUNTRY"):
            params["from_country"] = (
                from_country or settings.SENDCLOUD_SENDER_COUNTRY
            ).upper()

        if from_postal_code or hasattr(settings, "SENDCLOUD_SENDER_POSTAL_CODE"):
            params["from_postal_code"] = (
                from_postal_code or settings.SENDCLOUD_SENDER_POSTAL_CODE
            )

        try:
            logger.debug(
                f"Requesting shipping price from Sendcloud: method_id={shipping_method_id}, "
                f"to_country={to_country}, to_postal_code={to_postal_code}, weight={weight}kg"
            )
            response = self._make_request("GET", "/shipping-price", params=params)

            # Log the raw response for debugging
            logger.debug(f"Sendcloud price API response: {response}")

            # Response can be an array with price info or a single object
            if response:
                if isinstance(response, list) and len(response) > 0:
                    price_data = response[0]
                    logger.debug(f"Extracted price data: {price_data}")
                    return price_data
                elif isinstance(response, dict):
                    # Sometimes the API returns a dict directly
                    if "price" in response or "shipping_price" in response:
                        logger.debug(f"Price data from dict response: {response}")
                        return response

            logger.warning(
                f"No price data in response for method {shipping_method_id}. "
                f"Response type: {type(response)}, Response: {response}"
            )
            return None
        except SendcloudAPIError as e:
            logger.warning(
                f"Failed to get shipping price for method {shipping_method_id}: {e}. "
                f"Params: {params}"
            )
            return None
