# Address and Name Refactoring Summary

## Overview

Refactored the address and name handling to follow the **Single Source of Truth** principle. Customer name and phone are now sourced from the user's profile, not duplicated in the Address model.

## Changes Made

### 1. Address Model (`backend/account/models.py`)

**Removed Fields:**

- `first_name` - Moved to user profile (via `CustomUser.name`)
- `last_name` - Moved to user profile (via `CustomUser.name`)
- `phone` - Moved to user profile (via `Profile.phone`)

**Updated Address Model:**

```python
class Address(models.Model):
    """
    Address model for storing location information.
    Name and phone should be retrieved from User's Profile.
    """
    address_line = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    country = models.CharField(
        max_length=2,
        blank=True,
        null=True,
        default="GB",
        help_text="ISO 3166-1 alpha-2 country code (e.g., GB, US)",
    )
```

### 2. CustomUser Model

**Status:** ✅ **KEPT AS-IS**

The `name` field in `CustomUser` **cannot be removed** because:

- It's used in `REQUIRED_FIELDS` for superuser creation
- It's a unique identifier in the system
- It's referenced throughout the codebase
- It serves as the single source of truth for customer names

```python
class CustomUser(AbstractBaseUser, PermissionsMixin):
    name = models.CharField(max_length=255, unique=True)  # REQUIRED
    email = models.EmailField(null=True, blank=True, unique=True)
    # ... other fields
```

### 3. Shipping Service (`backend/shipping/service.py`)

**Updated Shipment Creation:**

```python
# Before:
name=f"{address.first_name} {address.last_name}",
phone=address.phone or "",

# After:
customer_name = order.customer.name if order.customer else "Customer"
customer_phone = ""
if order.customer and hasattr(order.customer, 'profile') and order.customer.profile:
    customer_phone = order.customer.profile.phone or ""

# Uses customer name and profile phone
name=customer_name,
phone=customer_phone,
```

### 4. Frontend Checkout (`frontend-marketplace/src/app/checkout/page.tsx`)

**Removed Form Fields:**

- `firstName` input field
- `lastName` input field

**Updated Data Flow:**

- Name is automatically retrieved from `user.name` (no manual entry needed)
- Phone is pre-filled from `profile.phone`
- Address payload no longer includes `first_name`, `last_name`
- Billing details use `user.name` instead of form fields

**ShippingFormData Interface:**

```typescript
// Before:
interface ShippingFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  // ... address fields
}

// After:
interface ShippingFormData {
  email: string;
  phone: string;
  // ... address fields
  // Name comes from user profile automatically
}
```

## Data Source Hierarchy

### Customer Information Flow

```
┌─────────────────────────────────────┐
│         CustomUser.name             │  ← Single Source of Truth
│    (e.g., "John Smith")             │
└─────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────┐
│         Profile.phone               │  ← Single Source of Truth
│    (e.g., "+44 20 1234 5678")      │
└─────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────┐
│         Address Model               │
│  - address_line                     │
│  - city                             │
│  - postal_code                      │
│  - country                          │
└─────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────┐
│      Shipping Service               │
│  Combines:                          │
│  - customer.name                    │
│  - profile.phone                    │
│  - address fields                   │
│  → Sends to Sendcloud               │
└─────────────────────────────────────┘
```

## Benefits

✅ **Single Source of Truth:** Name and phone stored in one place (user profile)  
✅ **No Data Duplication:** Eliminates redundant fields in Address model  
✅ **Consistency:** Name always matches user's profile across the system  
✅ **Simpler Database:** Fewer fields to maintain and migrate  
✅ **Better UX:** User doesn't need to re-enter their name during checkout  
✅ **Cleaner Code:** Less data to validate and synchronize

## Migration Required

After making these changes, you need to create and run a migration:

```bash
cd backend
python manage.py makemigrations account
python manage.py migrate
```

This will:

- Remove `first_name`, `last_name`, and `phone` columns from `address` table
- Add `country` field with default value "GB"

## Testing Checklist

- [ ] User profile displays correct name and phone
- [ ] Checkout page shows user's name (not editable)
- [ ] Checkout page pre-fills phone from profile
- [ ] Address saves correctly without name/phone fields
- [ ] Shipment creation uses customer.name and profile.phone
- [ ] Sendcloud receives correct customer information
- [ ] Order confirmation shows correct customer details

## Backward Compatibility

**⚠️ Important:** If you have existing addresses with `first_name`, `last_name`, or `phone` data:

1. **Before migration:** Extract and save this data if needed
2. **Alternative:** Create a data migration to preserve the information
3. **Recommended:** Since these fields were just added, dropping them should be safe

## Questions?

If you encounter issues:

1. Check that `CustomUser.name` is populated for all users
2. Verify `Profile.phone` exists and is populated
3. Ensure migrations ran successfully
4. Check shipping service logs for any errors

---

**Date:** December 9, 2025  
**Status:** ✅ Complete - Ready for migration
