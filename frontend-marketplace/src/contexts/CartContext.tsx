"use client";
import * as React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

interface CartItem {
  productId: number;
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (productId: number, quantity?: number) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("cart");
    if (stored) setCart(JSON.parse(stored));
  }, []);

  // Save cart to localStorage on change
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  const addToCart = (productId: number, quantity: number = 1) => {
    setCart((prev: CartItem[]) => {
      const existing = prev.find(
        (item: CartItem) => item.productId === productId
      );
      if (existing) {
        return prev.map((item: CartItem) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        return [...prev, { productId, quantity }];
      }
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev: CartItem[]) => {
      const existing = prev.find(
        (item: CartItem) => item.productId === productId
      );
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter((item: CartItem) => item.productId !== productId);
      } else {
        return prev.map((item: CartItem) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
    });
  };

  const clearCart = () => setCart([]);

  return React.createElement(
    CartContext.Provider,
    { value: { cart, addToCart, removeFromCart, clearCart } },
    children
  );
};

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
