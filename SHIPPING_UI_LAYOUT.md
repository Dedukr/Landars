# Shipping Options UI Layout

## Updated Design

The shipping options now display with an improved layout:

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  ○  [Royal Mail Logo]  Royal Mail                      £4.49   │
│                         Medium Parcel 0-5kg                      │
│                         🚚 Estimated delivery: 2-3 days         │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

```
[Radio] [Carrier Logo] [Carrier Name + Details]           [Price]
  ○     [Royal Mail]    Royal Mail                        £4.49
                        Medium Parcel 0-5kg
                        🚚 Est. delivery: 2-3 days
```

### Key Changes

1. **Carrier Display**:
   - ❌ Old: Shows "royal_mailv2" as text
   - ✅ New: Shows "Royal Mail" with styled logo badge

2. **Layout**:
   - ❌ Old: Horizontal layout with carrier - service name
   - ✅ New: Vertical layout with:
     - **Top**: Carrier name (bold, prominent)
     - **Bottom**: Service details (size, weight range)

3. **Service Details Extraction**:
   - Automatically removes redundant text
   - Example: "Royal Mail Tracked 48 - Medium Parcel 0-5kg" → "Medium Parcel 0-5kg"

4. **Logo Styling**:
   - White background badge
   - Red text (Royal Mail brand color)
   - Rounded border
   - Clean, professional appearance

## Visual Example

### Before:
```
○  royal_mailv2 - Royal Mail Tracked 48 - Large Letter        £2.99
○  royal_mailv2 - Royal Mail Tracked 48 - Small Parcel        £3.99
○  royal_mailv2 - Royal Mail Tracked 48 - Medium Parcel 0-5kg £4.49
```

### After:
```
┌─────────────────────────────────────────────────────┐
│  ○  [Royal Mail]  Royal Mail              £2.99    │
│                    Large Letter                     │
│                    🚚 2-3 days                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  ○  [Royal Mail]  Royal Mail              £3.99    │
│                    Small Parcel                     │
│                    🚚 2-3 days                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  ●  [Royal Mail]  Royal Mail              £4.49    │ (Selected)
│                    Medium Parcel 0-5kg              │
│                    🚚 2-3 days                      │
└─────────────────────────────────────────────────────┘
```

## Weight-Based Filtering

With the backend filtering in place, customers will typically see **only 1 option** that matches their order weight:

- **0-0.1kg** → Large Letter (£2.99)
- **0.1-2kg** → Small Parcel (£3.99)
- **2-5kg** → Medium Parcel 0-5kg (£4.49)
- **5-10kg** → Medium Parcel 5-10kg (£4.99)
- **10-20kg** → Medium Parcel 10-20kg (£5.49)

## Code Implementation

### Carrier Logo Function
```typescript
const getCarrierInfo = (carrier: string) => {
  if (carrier.includes("royal") || carrier === "royal_mailv2") {
    return {
      name: "Royal Mail",
      logo: <RoyalMailBadge />
    };
  }
  // Extensible for other carriers
};
```

### Service Details Extraction
```typescript
const extractServiceDetails = (serviceName: string) => {
  return serviceName
    .replace(/Royal Mail/gi, "")
    .replace(/Tracked 48/gi, "")
    .trim();
  // Result: "Medium Parcel 0-5kg"
};
```

## Benefits

✅ **Professional appearance** - Recognizable carrier branding  
✅ **Clear hierarchy** - Carrier name prominent, details secondary  
✅ **Better UX** - Easier to scan and compare options  
✅ **Scalable** - Easy to add more carriers (DPD, Evri, etc.)  
✅ **Accessible** - Maintains radio button semantics  
✅ **Responsive** - Works on mobile and desktop  

## Future Enhancements

- Add actual Royal Mail logo image (SVG)
- Add carrier logos for DPD, Evri, etc.
- Add estimated delivery date (not just days)
- Show package size visualization

