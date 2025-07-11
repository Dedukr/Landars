"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
}

export default function CartPage() {
  const { cart, addToCart, removeFromCart, clearCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    async function fetchProducts() {
      if (cart.length === 0) {
        setProducts([]);
        return;
      }
      const ids = cart.map((item) => item.productId).join(",");
      const res = await fetch(`/api/products/?ids=${ids}`);
      if (res.ok) {
        setProducts(await res.json());
      } else {
        setProducts([]);
      }
    }
    fetchProducts();
  }, [cart]);

  function getProduct(productId: number) {
    return products.find((p) => p.id === productId);
  }

  function getItemTotal(productId: number, quantity: number) {
    const product = getProduct(productId);
    if (!product) return 0;
    return parseFloat(product.price) * quantity;
  }

  const total = cart.reduce(
    (sum, item) => sum + getItemTotal(item.productId, item.quantity),
    0
  );

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Your Cart</h1>
      {cart.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg mb-4">Your cart is empty.</p>
          <Link
            href="/"
            className="text-blue-600 underline hover:text-blue-800"
          >
            Go back to shop
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gray-200 mb-6">
            {cart.map((item) => {
              const product = getProduct(item.productId);
              return (
                <li
                  key={item.productId}
                  className="flex items-center gap-4 py-4"
                >
                  {product?.image_url ? (
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      width={64}
                      height={64}
                      className="w-16 h-16 object-cover rounded"
                    />
                  ) : (
                    <span className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded text-2xl">
                      🍎
                    </span>
                  )}
                  <div className="flex-1">
                    <div className="font-semibold">
                      {product?.name || "Product"}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        className="px-2 py-1 rounded bg-gray-200 text-lg font-bold"
                        onClick={() => removeFromCart(item.productId)}
                        disabled={item.quantity <= 0}
                      >
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        className="px-2 py-1 rounded bg-gray-200 text-lg font-bold"
                        onClick={() => addToCart(item.productId, 1)}
                      >
                        +
                      </button>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      £{product?.price}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      className="text-red-600 hover:underline text-sm"
                      onClick={() => removeFromCart(item.productId)}
                    >
                      Remove
                    </button>
                    <div className="font-bold">
                      £{getItemTotal(item.productId, item.quantity).toFixed(2)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between items-center mb-6">
            <button
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
              onClick={clearCart}
            >
              Clear Cart
            </button>
            <div className="text-xl font-bold">Total: £{total.toFixed(2)}</div>
          </div>
          <Link
            href="/"
            className="text-blue-600 underline hover:text-blue-800"
          >
            Continue Shopping
          </Link>
        </>
      )}
    </main>
  );
}
