# Sendcloud Price Issue - Debugging Guide

## Problem
All shipping options show £0.00 price.

## Likely Causes

### 1. **Sendcloud API doesn't return prices in `/shipping_methods` endpoint**

The Sendcloud `/shipping_methods` endpoint typically returns available shipping methods but **NOT the actual prices**. Prices are usually calculated when creating a shipment or through a separate pricing API.

### 2. **Missing Sendcloud Integration Configuration**

Sendcloud requires:
- Shipping rules configured in your Sendcloud panel
- Carrier contracts set up
- Pricing rules defined per carrier

## Solutions

### Option A: Use Mock Prices (Development/Testing)

For development without full Sendcloud setup, you can use mock prices based on carrier type:

```python
def _get_mock_price(self, carrier: str, service: str) -> str:
    """Get mock price for development"""
    mock_prices = {
        "dpd": "5.99",
        "royal-mail": "3.50",
        "evri": "4.99",
        "ups": "7.99",
    }
    return mock_prices.get(carrier.lower(), "5.00")
```

### Option B: Configure Sendcloud Properly

1. Log into Sendcloud panel
2. Go to Settings → Shipping Methods
3. Configure your carriers (DPD, Royal Mail, Evri, etc.)
4. Set up pricing rules for each carrier
5. Enable the carriers you want to use

### Option C: Use Sendcloud Shipping Prices API

Sendcloud may have a separate endpoint for getting shipping prices. Check their API docs:
- `/shipping_price` endpoint
- Or price calculation during parcel creation

## Temporary Fix

Add this to `service.py` to use fallback prices:

```python
def _normalize_shipping_option(self, method: Dict[str, Any]) -> Dict[str, Any]:
    price = method.get("price")
    
    # If no price from Sendcloud, use fallback based on carrier
    if not price or price == "0" or price == "0.00":
        carrier = method.get("carrier", "").lower()
        # Fallback prices (update based on your actual rates)
        fallback_prices = {
            "dpd": "5.99",
            "royal mail": "3.50", 
            "evri": "4.99",
            "ups": "7.99",
            "hermes": "4.99",
        }
        price = fallback_prices.get(carrier, "5.00")
        logger.warning(f"Using fallback price {price} for carrier {carrier}")
    
    return {
        "id": method.get("id"),
        "carrier": method.get("carrier", "Unknown"),
        "name": method.get("name", "Standard Shipping"),
        "price": self._parse_price(price),
        # ... rest of fields
    }
```

## Check Sendcloud Response

To see what Sendcloud actually returns, check the backend logs after making a request:

```bash
docker compose logs backend | grep -i "sendcloud\|shipping"
```

Look for the logged shipping method structure to see what fields are available.

