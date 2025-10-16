/**
 * Delivery Fee Calculator
 * Implements the same logic as the Django admin OrderAdmin.save_related method
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
}

/**
 * Calculate delivery fee based on cart contents
 * Implements the exact logic from Django admin OrderAdmin.save_related
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

  // Implement the exact logic from Django admin OrderAdmin.save_related
  // Check if ALL products are sausages (only sausages)
  let allProductsAreSausages = true;
  for (const product of products) {
    const categoryNames = product.categories.map((cat) => cat.toLowerCase());
    // If the sausage category is NOT in this product's categories, then not all products are sausages
    if (!categoryNames.includes(sausageCategory.toLowerCase())) {
      allProductsAreSausages = false;
      break;
    }
  }

  if (allProductsAreSausages) {
    // ALL products are sausages, use post delivery
    isHomeDelivery = false;
    hasSausages = true;

    if (subtotal > 220) {
      deliveryFee = 0;
      reasoning = "Free delivery for sausages over £220";
    } else {
      // Weight-based delivery fees for sausages
      if (totalWeight <= 2) {
        deliveryFee = 5;
        reasoning = `Sausages ≤2kg: £5 delivery fee`;
      } else if (totalWeight <= 10) {
        deliveryFee = 8;
        reasoning = `Sausages ≤10kg: £8 delivery fee`;
      } else {
        deliveryFee = 15;
        reasoning = `Sausages >10kg: £15 delivery fee`;
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
