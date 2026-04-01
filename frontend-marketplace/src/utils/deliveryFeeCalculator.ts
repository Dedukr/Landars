/**
 * Delivery Fee Calculator
 * Post-delivery bands match backend `shipping.sendcloud_shipping.ShippingService.get_delivery_fee_by_weight()`:
 * base cost + 20%, rounded to pence (small 0–2 kg, medium 2–5 / 5–10 / 10–20 kg).
 */

export interface CartProduct {
  id: number;
  name: string;
  price: number;
  categories: string[];
  quantity: number;
}

export interface DeliveryFeeCalculation {
  deliveryFee: number;
  isHomeDelivery: boolean;
  totalWeight: number;
  hasSausages: boolean;
  reasoning: string;
  dependsOnCourier: boolean;
  overweight: boolean;
}

/** Base GBP × 1.2, half-up to 2 dp — keep in sync with `POST_DELIVERY_FEE_BANDS_GBP` in backend. */
const POST_DELIVERY_FEE_BANDS: readonly { maxKg: number; priceGbp: number }[] = [
  { maxKg: 2, priceGbp: 3.24 }, // 2.70 × 1.2
  { maxKg: 5, priceGbp: 6.06 }, // 5.05 × 1.2
  { maxKg: 10, priceGbp: 7.91 }, // 6.59 × 1.2
  { maxKg: 20, priceGbp: 12.8 }, // 10.67 × 1.2
];

/**
 * Post-delivery fee by weight (matches backend ShippingService.get_delivery_fee_by_weight)
 */
function getRoyalMailDeliveryFeeByWeight(weight: number): number {
  weight = Math.max(weight, 0.1);

  if (weight > 20) {
    return 0;
  }

  for (const { maxKg, priceGbp } of POST_DELIVERY_FEE_BANDS) {
    if (weight <= maxKg) {
      return priceGbp;
    }
  }

  return 0;
}

/**
 * Calculate delivery fee based on cart contents
 * Uses Royal Mail pricing for post-suitable items (same as backend)
 */
export function calculateDeliveryFee(
  products: CartProduct[]
): DeliveryFeeCalculation {
  // Check if cart contains sausages and marinated products
  const sausageCategory = "Sausages and Marinated products";

  // Calculate total weight (assuming quantity represents weight in kg)
  const totalWeight = products.reduce(
    (sum, product) => sum + product.quantity,
    0
  );

  // Calculate subtotal
  const subtotal = products.reduce(
    (sum, product) => sum + product.price * product.quantity,
    0
  );

  let deliveryFee = 0;
  let isHomeDelivery = true;
  let reasoning = "";
  let hasSausages = false;
  let dependsOnCourier = false;
  let overweight = false;

  // Check if ALL products are sausages (only sausages)
  let allProductsAreSausages = true;
  for (const product of products) {
    // Ensure categories is an array and filter out non-string values
    const validCategories = (product.categories || []).filter(
      (cat): cat is string => typeof cat === "string"
    );
    const categoryNames = validCategories.map((cat) => cat.toLowerCase());
    // If the sausage category is NOT in this product's categories, then not all products are sausages
    if (!categoryNames.includes(sausageCategory.toLowerCase())) {
      allProductsAreSausages = false;
      break;
    }
  }

  if (allProductsAreSausages) {
    // ALL products are sausages, use post delivery with Royal Mail pricing
    isHomeDelivery = false;
    hasSausages = true;

    if (subtotal > 220) {
      deliveryFee = 0;
      reasoning = "Free delivery for sausages over £220";
    } else {
      // Use Royal Mail weight-based delivery fees
      if (totalWeight > 20) {
        deliveryFee = 0;
        overweight = true;
        dependsOnCourier = true;
        reasoning =
          "We can ship sausage orders up to 20kg. Please split your order or contact us for assistance.";
      } else {
        deliveryFee = getRoyalMailDeliveryFeeByWeight(totalWeight);
        if (totalWeight <= 2) {
          reasoning = `Sausages up to 2kg: £${deliveryFee.toFixed(2)} delivery fee`;
        } else if (totalWeight <= 5) {
          reasoning = `Sausages 2–5kg: £${deliveryFee.toFixed(2)} delivery fee`;
        } else if (totalWeight <= 10) {
          reasoning = `Sausages 5–10kg: £${deliveryFee.toFixed(2)} delivery fee`;
        } else {
          reasoning = `Sausages 10–20kg: £${deliveryFee.toFixed(2)} delivery fee`;
        }
      }
    }
  } else {
    // Mixed products or no sausages, use home delivery
    isHomeDelivery = true;
    deliveryFee = 10;
    reasoning = "Standard home delivery: £10 delivery fee";
  }

  return {
    deliveryFee,
    isHomeDelivery,
    totalWeight,
    hasSausages,
    reasoning,
    dependsOnCourier,
    overweight,
  };
}

/**
 * Get delivery fee breakdown for display
 */
export function getDeliveryFeeBreakdown(calculation: DeliveryFeeCalculation) {
  return {
    fee: calculation.deliveryFee,
    type: calculation.isHomeDelivery ? "Home Delivery" : "Post Delivery",
    weight: calculation.totalWeight,
    hasSausages: calculation.hasSausages,
    reasoning: calculation.reasoning,
    isFree: calculation.deliveryFee === 0,
    dependsOnCourier: calculation.dependsOnCourier,
    overweight: calculation.overweight,
  };
}

/**
 * Calculate total order price including delivery fee and discount
 * Matches Order.total_price = sum_price + delivery_fee - discount
 */
export function calculateTotalPrice(
  subtotal: number,
  deliveryFee: number,
  discount: number = 0
): number {
  return subtotal + deliveryFee - discount;
}
