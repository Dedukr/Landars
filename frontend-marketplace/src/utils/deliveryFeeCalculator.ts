/**
 * Delivery Fee Calculator (cart UI hints).
 * Post-delivery charges on the server use Sendcloud `/shipping-price` plus
 * `POST_DELIVERY_SENDCLOUD_MARKUP_PERCENT` (default 20%) — see
 * `ShippingService.get_delivery_fee_by_weight` / checkout quotes.
 */

export interface CartProduct {
  id: number;
  name: string;
  price: number;
  categories: string[];
  quantity: number;
  /** Optional unit weight (kg) for parcel estimate; when set, total weight uses Σ(weight×qty). */
  weightKg?: number;
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

function estimatedParcelWeightKg(products: CartProduct[]): number {
  const hasUnitWeights = products.some(
    (p) => typeof p.weightKg === "number" && p.weightKg > 0
  );
  if (hasUnitWeights) {
    return products.reduce(
      (sum, p) =>
        sum +
        (typeof p.weightKg === "number" && p.weightKg > 0 ? p.weightKg : 0) *
          p.quantity,
      0
    );
  }
  return products.reduce((sum, product) => sum + product.quantity, 0);
}

/**
 * Calculate delivery fee based on cart contents
 * Post delivery: actual fee comes from the API at checkout (Sendcloud + markup).
 */
export function calculateDeliveryFee(
  products: CartProduct[]
): DeliveryFeeCalculation {
  // Check if cart contains sausages and marinated products
  const sausageCategory = "Sausages and Marinated products";

  const totalWeight = estimatedParcelWeightKg(products);

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
      if (totalWeight > 20) {
        deliveryFee = 0;
        overweight = true;
        dependsOnCourier = true;
        reasoning =
          "We can ship sausage orders up to 20kg. Please split your order or contact us for assistance.";
      } else {
        deliveryFee = 0;
        dependsOnCourier = true;
        reasoning =
          "Post delivery price is set at checkout from live courier rates (includes markup).";
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
