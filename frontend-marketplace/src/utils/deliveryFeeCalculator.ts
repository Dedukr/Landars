/**
 * Delivery Fee Calculator (cart UI hints).
 * Post-delivery charges on the server use Sendcloud `/shipping-price` plus
 * `POST_DELIVERY_SENDCLOUD_MARKUP_PERCENT` (default 20%) — see
 * `ShippingService.get_delivery_fee_by_weight` / checkout quotes.
 *
 * Post-delivery eligibility uses CategoryGroup #1 (``POST_DELIVERY_CATEGORY_GROUP_ID``).
 */

import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import {
  allProductsMatchCategoryGroup,
  categoryGroupNameSet,
} from "@/lib/categoryGroups";
import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";

export const FREE_HOME_DELIVERY_THRESHOLD = 200;
export const HOME_DELIVERY_FEE = 10;

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
  allPostDelivery: boolean;
  qualifiesForFreeHomeDelivery: boolean;
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
 * Calculate delivery fee based on cart contents.
 * Post delivery: actual fee comes from the API at checkout (Sendcloud + markup).
 */
export function calculateDeliveryFee(
  products: CartProduct[],
  postDeliveryGroup?: ApiCategoryGroup | null,
  categoryRecords?: ShopCategoryRecord[]
): DeliveryFeeCalculation {
  const totalWeight = estimatedParcelWeightKg(products);

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

  const nameSet = postDeliveryGroup
    ? categoryGroupNameSet(postDeliveryGroup, categoryRecords)
    : new Set<string>();

  const allPostDelivery =
    postDeliveryGroup &&
    nameSet.size > 0 &&
    allProductsMatchCategoryGroup(products, nameSet);

  if (allPostDelivery) {
    isHomeDelivery = false;
    hasSausages = true;

    if (totalWeight > 20) {
      deliveryFee = 0;
      overweight = true;
      dependsOnCourier = true;
      reasoning =
        "We can ship post-delivery orders up to 20kg. Please split your order or contact us for assistance.";
    } else {
      deliveryFee = 0;
      dependsOnCourier = true;
      reasoning =
        "Post delivery price is set at checkout from live courier rates (includes markup).";
    }
  } else {
    isHomeDelivery = true;
    if (subtotal >= FREE_HOME_DELIVERY_THRESHOLD) {
      deliveryFee = 0;
      reasoning = `Free home delivery on orders of £${FREE_HOME_DELIVERY_THRESHOLD} or more`;
    } else {
      deliveryFee = HOME_DELIVERY_FEE;
      reasoning = `Standard home delivery: £${HOME_DELIVERY_FEE} delivery fee`;
    }
  }

  const qualifiesForFreeHomeDelivery =
    !allPostDelivery && subtotal >= FREE_HOME_DELIVERY_THRESHOLD;

  return {
    deliveryFee,
    isHomeDelivery,
    allPostDelivery: Boolean(allPostDelivery),
    qualifiesForFreeHomeDelivery,
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
