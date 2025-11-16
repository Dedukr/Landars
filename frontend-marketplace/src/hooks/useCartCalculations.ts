"use client";
import { useMemo } from "react";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  description?: string;
  categories?: string[];
}

interface CartItem {
  productId: number;
  quantity: number;
}

interface CartCalculations {
  subtotal: number;
  totalItems: number;
  cartProducts: Array<{
    id: number;
    name: string;
    price: number;
    categories: string[];
    quantity: number;
  }>;
}

export const useCartCalculations = (
  products: Product[],
  cart: CartItem[]
): CartCalculations => {
  return useMemo(() => {
    const subtotal = products.reduce((sum, product) => {
      const cartItem = cart.find((item) => item.productId === product.id);
      return sum + parseFloat(product.price) * (cartItem?.quantity || 0);
    }, 0);

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    const cartProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      price: parseFloat(product.price),
      categories: product.categories || [],
      quantity: cart.find((item) => item.productId === product.id)?.quantity || 0,
    }));

    return {
      subtotal,
      totalItems,
      cartProducts,
    };
  }, [products, cart]);
};
