"use client";
import { useMemo } from "react";
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
}: UseDeliveryFeeProps): UseDeliveryFeeReturn {
  // Calculate delivery fee when products or subtotal changes
  const deliveryCalculation = useMemo(() => {
    if (products.length === 0) {
      return {
        deliveryFee: 0,
        isHomeDelivery: true,
        totalWeight: 0,
        hasSausages: false,
        reasoning: "No items in cart",
        dependsOnCourier: false,
        overweight: false,
      };
    }

    return calculateDeliveryFee(products);
  }, [products]);

  // Get delivery fee breakdown for display
  const deliveryBreakdown = useMemo(() => {
    return getDeliveryFeeBreakdown(deliveryCalculation);
  }, [deliveryCalculation]);

  // Calculate total price including delivery fee and discount
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
