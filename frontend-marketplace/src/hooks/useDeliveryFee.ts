"use client";
import { useMemo } from "react";
import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";
import {
  calculateDeliveryFee,
  getDeliveryFeeBreakdown,
  calculateTotalPrice,
  type CartProduct,
  type DeliveryFeeCalculation,
} from "@/utils/deliveryFeeCalculator";

interface UseDeliveryFeeProps {
  products: CartProduct[];
  subtotal: number;
  discount?: number;
  postDeliveryGroup?: ApiCategoryGroup | null;
  categoryRecords?: ShopCategoryRecord[];
}

interface UseDeliveryFeeReturn {
  deliveryCalculation: DeliveryFeeCalculation;
  deliveryBreakdown: ReturnType<typeof getDeliveryFeeBreakdown>;
  totalPrice: number;
}

export function useDeliveryFee({
  products,
  subtotal,
  discount = 0,
  postDeliveryGroup = null,
  categoryRecords,
}: UseDeliveryFeeProps): UseDeliveryFeeReturn {
  const deliveryCalculation = useMemo(() => {
    if (products.length === 0) {
      return {
        deliveryFee: 0,
        isHomeDelivery: true,
        allPostDelivery: false,
        qualifiesForFreeHomeDelivery: false,
        totalWeight: 0,
        hasSausages: false,
        reasoning: "No items in cart",
        dependsOnCourier: false,
        overweight: false,
      };
    }

    return calculateDeliveryFee(
      products,
      postDeliveryGroup,
      categoryRecords
    );
  }, [products, postDeliveryGroup, categoryRecords]);

  const deliveryBreakdown = useMemo(() => {
    return getDeliveryFeeBreakdown(deliveryCalculation);
  }, [deliveryCalculation]);

  const totalPrice = useMemo(() => {
    return calculateTotalPrice(
      subtotal,
      deliveryCalculation.deliveryFee,
      discount
    );
  }, [subtotal, deliveryCalculation.deliveryFee, discount]);

  return {
    deliveryCalculation,
    deliveryBreakdown,
    totalPrice,
  };
}
