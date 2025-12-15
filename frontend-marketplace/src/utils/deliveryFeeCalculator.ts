/**
 * Delivery Fee Calculator
 * Uses Royal Mail pricing for post-suitable items (same as backend cart and order logic)
 * Royal Mail pricing: 0-5kg: £4.44, 5-10kg: £5.82, 10-20kg: £9.25, >20kg: no service
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

/**
 * Royal Mail delivery fee pricing map (matches backend ShippingService)
 * Maps weight thresholds to delivery fees in GBP
 */
const ROYAL_MAIL_DELIVERY_FEE_BY_WEIGHT: Record<number, number> = {
  5.0: 4.44, // 0-5kg: Medium Parcel 0-5kg
  10.0: 5.82, // 5-10kg: Medium Parcel 5-10kg
  20.0: 9.25, // 10-20kg: Delivery
};

/**
 * Get Royal Mail delivery fee based on weight
 * Matches backend ShippingService.get_delivery_fee_by_weight()
 */
function getRoyalMailDeliveryFeeByWeight(weight: number): number {
  // Ensure minimum weight
  weight = Math.max(weight, 0.1);

  // If weight exceeds supported range, return 0 to signal no available option
  if (weight > 20) {
    return 0;
  }

  // Find the appropriate price tier
  const thresholds = Object.keys(ROYAL_MAIL_DELIVERY_FEE_BY_WEIGHT)
    .map(Number)
    .sort((a, b) => a - b);

  for (const threshold of thresholds) {
    if (weight <= threshold) {
      return ROYAL_MAIL_DELIVERY_FEE_BY_WEIGHT[threshold];
    }
  }

  // Fallback should never be hit because >20kg is handled above
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
        // Format reasoning based on weight ranges
        if (totalWeight <= 5) {
          reasoning = `Sausages 0-5kg: £${deliveryFee.toFixed(2)} delivery fee`;
        } else if (totalWeight <= 10) {
          reasoning = `Sausages 5-10kg: £${deliveryFee.toFixed(
            2
          )} delivery fee`;
        } else {
          reasoning = `Sausages 10-20kg: £${deliveryFee.toFixed(
            2
          )} delivery fee`;
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
