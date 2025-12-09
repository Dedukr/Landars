# Environment Variables Configuration

This document lists all required environment variables for the FoodPlatform application.

## Sendcloud Shipping Integration Variables

Add these to your `.env` file to enable Sendcloud shipping integration:

```env
# Sendcloud Configuration
SENDCLOUD_PUBLIC_KEY=your_sendcloud_public_key_here
SENDCLOUD_SECRET_KEY=your_sendcloud_secret_key_here
SENDCLOUD_SENDER_COUNTRY=GB
SENDCLOUD_SENDER_POSTAL_CODE=your_business_postal_code
```

### How to Get Sendcloud Credentials

1. Sign up at [Sendcloud](https://www.sendcloud.com/)
2. Go to Settings → Integration
3. Generate API keys (Public Key and Secret Key)
4. Copy the keys to your `.env` file

### Configuration Details

- **SENDCLOUD_PUBLIC_KEY**: Your Sendcloud public API key
- **SENDCLOUD_SECRET_KEY**: Your Sendcloud secret API key  
- **SENDCLOUD_SENDER_COUNTRY**: Your business country code (ISO 3166-1 alpha-2, e.g., "GB" for UK)
- **SENDCLOUD_SENDER_POSTAL_CODE**: Your business postal code (used for shipping calculations)

### Optional: Filtering Shipping Options

You can filter which shipping methods are shown to customers:

```env
# Only show specific carriers (comma-separated)
SENDCLOUD_ALLOWED_CARRIERS=royal_mail,royal_mailv2

# Only show specific services (comma-separated, partial match)
SENDCLOUD_ALLOWED_SERVICES=tracked 48

# Exclude specific services (comma-separated, partial match)
SENDCLOUD_EXCLUDE_SERVICES=signed,tracked 24,express
```

**Example**: To show only Royal Mail Tracked 48 (standard 2-3 day delivery) with different size options:
```env
SENDCLOUD_ALLOWED_CARRIERS=royal_mail,royal_mailv2
SENDCLOUD_ALLOWED_SERVICES=tracked 48
SENDCLOUD_EXCLUDE_SERVICES=signed,tracked 24
```

This will filter to show only Royal Mail Tracked 48 options (Large Letter, Small Parcel, Medium Parcel in different weight ranges).

## Testing Without Sendcloud

If you want to test the application without Sendcloud credentials:

1. The shipping endpoints will return an error about missing credentials
2. You can skip the shipping selection in checkout (though validation will fail)
3. For development, you can temporarily disable shipping validation or use mock data

## Required for Production

All four Sendcloud environment variables are **required** for production deployment where shipping functionality is needed.

