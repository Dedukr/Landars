# Sendcloud Shipping Integration

This document describes the Sendcloud shipping integration implemented in the FoodPlatform application.

## Overview

The shipping integration uses Sendcloud as a single abstraction layer for all carriers (Evri, Royal Mail, etc.). The system is designed so that:

- Your app communicates with **one external API**: Sendcloud
- Sendcloud communicates with multiple carriers (configured in Sendcloud dashboard)
- The checkout UI displays generic shipping options, not carrier-specific details

## Architecture

### 1. Backend Structure

#### Shipping Module (`backend/shipping/`)

The shipping module is organized as follows:

```
shipping/
├── __init__.py
├── apps.py
├── models.py                  # No models needed (shipping info stored on Order)
├── admin.py
├── sendcloud_client.py       # Sendcloud API client
├── service.py                # Business logic layer
├── views.py                  # REST API endpoints
└── urls.py                   # URL routing
```

**Key Components:**

1. **Sendcloud Client** (`sendcloud_client.py`)

   - Handles all communication with Sendcloud API
   - Methods:
     - `get_shipping_methods()` - Fetch available shipping options
     - `create_parcel()` - Create a shipment
     - `get_parcel()` - Get shipment status
     - `cancel_parcel()` - Cancel a shipment

2. **Shipping Service** (`service.py`)

   - Abstracts Sendcloud details
   - Normalizes data between internal format and Sendcloud format
   - Calculates parcel weight from order items
   - Methods:
     - `get_shipping_options()` - Get normalized shipping options
     - `create_shipment()` - Create shipment for an order
     - `get_shipment_status()` - Check shipment status

3. **API Views** (`views.py`)
   - REST endpoints for frontend
   - Endpoints:
     - `POST /api/shipping/options/` - Get shipping options
     - `POST /api/shipping/shipments/` - Create shipment
     - `GET /api/shipping/shipments/<id>/` - Get shipment status

#### Order Model Extensions

The `Order` model has been extended with shipping fields:

```python
# Shipping fields
shipping_method_id          # Sendcloud method ID
shipping_carrier            # Carrier name (e.g., "DPD", "Royal Mail")
shipping_service_name       # Service name (e.g., "Standard", "Express")
shipping_cost               # Cost charged to customer
shipping_tracking_number    # Tracking number from carrier
shipping_tracking_url       # Tracking URL
shipping_label_url          # Label PDF URL
sendcloud_parcel_id         # Sendcloud parcel ID
```

#### Address Model

The `Address` model stores location information only. Name and phone information is retrieved from the user's `Profile`:

```python
address_line    # Street address
address_line2   # Additional address line (optional)
city            # City name
postal_code     # Postal/ZIP code
country         # ISO 3166-1 alpha-2 country code (e.g., "GB"), defaults to "GB"
```

**Note:** Customer name comes from `CustomUser.name` and phone comes from `Profile.phone`. This follows the single source of truth principle.

### 2. Frontend Structure

#### Shipping Components

1. **useShippingOptions Hook** (`hooks/useShippingOptions.ts`)

   - Fetches shipping options from backend
   - Manages loading and error states
   - Provides `fetchShippingOptions()` method

2. **ShippingOptions Component** (`components/ShippingOptions.tsx`)
   - Displays available shipping options
   - Allows user to select one option
   - Shows delivery time estimates and prices

#### Checkout Flow Updates

The checkout page (`app/checkout/page.tsx`) has been updated to:

1. Collect shipping address from the user (name comes from user profile automatically)
2. Automatically fetch shipping options when address is complete
3. Display shipping options for user selection
4. Validate that a shipping option is selected before payment
5. Include selected shipping information in order creation
6. Use `CustomUser.name` and `Profile.phone` as the source of truth for customer information

## Setup Instructions

### 1. Sendcloud Account Setup

1. Create a Sendcloud account at https://www.sendcloud.com/
2. Configure your carriers (Evri, Royal Mail, etc.) in the Sendcloud dashboard
3. Get your API credentials:
   - Public Key
   - Secret Key
4. Configure your sender address in Sendcloud

### 2. Environment Variables

Add the following to your `.env` file:

```env
# Sendcloud Configuration
SENDCLOUD_PUBLIC_KEY=your_public_key_here
SENDCLOUD_SECRET_KEY=your_secret_key_here
SENDCLOUD_SENDER_COUNTRY=GB
SENDCLOUD_SENDER_POSTAL_CODE=your_postal_code_here
```

### 3. Database Migrations

Run migrations to add the new shipping fields:

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
```

### 4. Dependencies

The shipping integration uses the `requests` library for API calls. Ensure it's in your `requirements.txt`:

```
requests>=2.31.0
```

## API Usage

### Get Shipping Options

**Endpoint:** `POST /api/shipping/options/`

**Request:**

```json
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
```

**Response:**

```json
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
```

### Create Shipment

**Endpoint:** `POST /api/shipping/shipments/`

**Request:**

```json
{
  "order_id": 123,
  "shipping_method_id": 8
}
```

**Response:**

```json
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
```

## Data Flow

The complete checkout flow works as follows:

1. **User enters shipping address**

   - Form validates address fields
   - Address includes: address, city, postal code
   - Name comes from user profile (`CustomUser.name`)
   - Phone comes from user profile (`Profile.phone`)

2. **Frontend fetches shipping options**

   - Triggered automatically when address is complete
   - Debounced to avoid excessive API calls
   - Sends address + cart items to backend

3. **Backend processes request**

   - Service layer calculates total weight
   - Calls Sendcloud API with address and weight
   - Normalizes response into standard format
   - Returns options to frontend

4. **User selects shipping option**

   - Frontend displays all available options
   - User clicks to select one
   - Selected option is stored in checkout state

5. **User completes payment**

   - Validates shipping option is selected
   - Creates order with shipping information
   - Order stores: method_id, carrier, service_name, cost

6. **Post-order fulfillment** (future step)
   - Admin/automated process creates actual shipment
   - Calls `create_shipment()` with order and method_id
   - Receives tracking number and label
   - Updates order with tracking information

## Testing

### Manual Testing

1. Start the backend server
2. Ensure Sendcloud credentials are configured
3. Navigate to checkout page
4. Fill in shipping address
5. Verify shipping options appear
6. Select a shipping option
7. Complete payment
8. Verify order includes shipping information

### Playwright Testing

A Playwright test suite should verify:

- Shipping options load when address is complete
- User can select a shipping option
- Order creation includes shipping data
- Validation prevents checkout without shipping selection

## Future Enhancements

1. **Product Weight Field**

   - Add `weight` field to Product model
   - Use actual weights in shipping calculations

2. **International Shipping**

   - Add country selector to checkout
   - Support multiple countries in shipping options

3. **Service Point Selection**

   - For carriers that support service points
   - Show map with nearby pickup locations

4. **Automated Shipment Creation**

   - Automatically create shipment when order is paid
   - Send tracking emails to customers

5. **Shipment Tracking Page**
   - Customer-facing tracking page
   - Display current shipment status
   - Show delivery timeline

## Troubleshooting

### No shipping options displayed

1. Check Sendcloud API credentials
2. Verify carriers are configured in Sendcloud dashboard
3. Check address format (postal code, country code)
4. Review browser console for errors
5. Check backend logs for API errors

### API errors

- **401 Unauthorized**: Check API credentials
- **400 Bad Request**: Verify address format
- **503 Service Unavailable**: Sendcloud API is down

### Weight calculation issues

- Currently uses quantity as proxy for weight (1 unit = 1kg)
- Add Product.weight field for accurate calculations
- Update `_calculate_parcel_weight()` in service.py

## Support

For issues with:

- **Sendcloud API**: Contact Sendcloud support
- **Integration code**: Refer to this documentation
- **Carrier issues**: Configure in Sendcloud dashboard

## References

- [Sendcloud API Documentation](https://docs.sendcloud.sc/api/v2/shipping/)
- [Sendcloud Dashboard](https://panel.sendcloud.sc/)
