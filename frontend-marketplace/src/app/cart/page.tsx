"use client";
import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import CheckoutProgress from "@/components/CheckoutProgress";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  description?: string;
  categories?: string[];
}

export default function CartPage() {
  const { cart, addToCart, removeFromCart, removeItem, clearCart, isLoading } =
    useCart();
  const { addToWishlist } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<number[]>([]);
  const [recommendations, setRecommendations] = useState<Product[]>([]);

  useEffect(() => {
    async function fetchProducts() {
      if (cart.length === 0) {
        setProducts([]);
        return;
      }

      setProductsLoading(true);
      try {
        // Fetch products individually since we don't have a bulk endpoint
        const productPromises = cart.map(async (item) => {
          try {
            const res = await fetch(`/api/products/${item.productId}/`);
            if (res.ok) {
              return await res.json();
            }
            console.warn(`Product ${item.productId} not found`);
            return null;
          } catch (error) {
            console.error(`Failed to fetch product ${item.productId}:`, error);
            return null;
          }
        });

        const productResults = await Promise.all(productPromises);
        setProducts(productResults.filter(Boolean));
      } catch (error) {
        console.error("Failed to fetch products:", error);
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
    }
    fetchProducts();
  }, [cart]);

  const fetchRecommendations = useCallback(async () => {
    try {
      // Get categories from cart items
      const cartCategories = products
        .filter((p) => p && p.categories)
        .flatMap((p) => p.categories || [])
        .filter((cat, index, arr) => arr.indexOf(cat) === index); // Remove duplicates

      // Get cart product IDs to exclude
      const cartProductIds = cart.map((item) => item.productId);

      // Build query parameters
      const params = new URLSearchParams();
      params.append("limit", "4");

      if (cartProductIds.length > 0) {
        params.append("exclude", cartProductIds.join(","));
      }

      if (cartCategories.length > 0) {
        params.append("categories", cartCategories.join(","));
      }

      const res = await fetch(`/api/products/?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && Array.isArray(data.results)) {
          setRecommendations(data.results.slice(0, 4));
        } else {
          setRecommendations([]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch recommendations:", error);
      setRecommendations([]);
    }
  }, [products, cart]);

  useEffect(() => {
    // Fetch recommendations when cart has items and products are loaded
    if (cart.length > 0 && products.length > 0) {
      fetchRecommendations();
    }
  }, [cart, products, fetchRecommendations]);

  function getProduct(productId: number) {
    return products.find((p) => p && p.id === productId);
  }

  function getItemTotal(productId: number, quantity: number) {
    const product = getProduct(productId);
    if (!product) return 0;
    return parseFloat(product.price) * quantity;
  }

  const subtotal = cart.reduce(
    (sum, item) => sum + getItemTotal(item.productId, item.quantity),
    0
  );

  const shipping = subtotal > 50 ? 0 : 4.99; // Free shipping over £50
  const tax = subtotal * 0.2; // 20% VAT
  const discount = appliedCoupon ? subtotal * 0.1 : 0; // 10% discount for demo
  const total = subtotal + shipping + tax - discount;

  const handleApplyCoupon = () => {
    if (couponCode.toLowerCase() === "save10") {
      setAppliedCoupon(couponCode);
      setCouponCode("");
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
  };

  const handleSaveForLater = async (productId: number) => {
    try {
      await addToWishlist(productId);
    } finally {
      setSavedItems((prev) => [...prev, productId]);
      removeItem(productId);
    }
  };

  const handleMoveToCart = (productId: number) => {
    setSavedItems((prev) => prev.filter((id) => id !== productId));
    addToCart(productId, 1);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            Shopping Cart - IMPROVED VERSION
          </h1>
          <p
            className="mt-2"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            {cart.length} {cart.length === 1 ? "item" : "items"} in your cart
          </p>
        </div>

        {productsLoading ? (
          <div className="text-center py-16">
            <div className="mb-6 text-4xl">⏳</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Loading your cart...
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Please wait while we fetch your items.
            </p>
          </div>
        ) : cart.length === 0 ? (
          <div className="text-center py-16">
            <div className="mb-6 text-8xl">🛒</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Your cart is empty
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Looks like you haven&apos;t added any items to your cart yet.
              Start shopping to fill it up!
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              Start Shopping
            </Link>
          </div>
        ) : (
          <>
            {/* Checkout Progress */}
            <CheckoutProgress
              currentStep={1}
              steps={["Cart", "Shipping", "Payment", "Review"]}
            />

            <div className="lg:grid lg:grid-cols-12 lg:gap-x-12 lg:items-start">
              {/* Cart Items */}
              <div className="lg:col-span-8">
                <div
                  className="rounded-lg shadow-sm overflow-hidden"
                  style={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--sidebar-border)",
                  }}
                >
                  <div
                    className="px-6 py-4"
                    style={{ borderBottom: "1px solid var(--sidebar-border)" }}
                  >
                    <h2
                      className="text-lg font-medium"
                      style={{ color: "var(--foreground)" }}
                    >
                      Cart Items
                    </h2>
                  </div>
                  <div style={{ borderTop: "1px solid var(--sidebar-border)" }}>
                    {cart.map((item) => {
                      const product = getProduct(item.productId);
                      if (!product) {
                        return null; // Skip items without product data
                      }
                      return (
                        <div key={item.productId} className="p-6">
                          <div className="flex items-center space-x-4">
                            <div className="flex-shrink-0">
                              {product?.image_url ? (
                                <Image
                                  src={product.image_url}
                                  alt={product.name}
                                  width={80}
                                  height={80}
                                  className="w-20 h-20 object-cover rounded-lg"
                                />
                              ) : (
                                <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                                  <span className="text-2xl">🍎</span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3
                                className="text-lg font-medium"
                                style={{ color: "var(--foreground)" }}
                              >
                                {product?.name || "Product"}
                              </h3>
                              {product?.description && (
                                <p
                                  className="text-sm mt-1 line-clamp-2"
                                  style={{
                                    color: "var(--foreground)",
                                    opacity: 0.6,
                                  }}
                                >
                                  {product.description}
                                </p>
                              )}
                              <div className="mt-2 flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() =>
                                      removeFromCart(item.productId)
                                    }
                                    disabled={isLoading || item.quantity <= 1}
                                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M20 12H4"
                                      />
                                    </svg>
                                  </button>
                                  <span className="w-8 text-center font-medium">
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => addToCart(item.productId, 1)}
                                    disabled={isLoading}
                                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                                      />
                                    </svg>
                                  </button>
                                </div>
                                <div
                                  className="text-sm"
                                  style={{
                                    color: "var(--foreground)",
                                    opacity: 0.6,
                                  }}
                                >
                                  £{product?.price} each
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end space-y-2">
                              <div
                                className="text-lg font-semibold"
                                style={{ color: "var(--foreground)" }}
                              >
                                £
                                {getItemTotal(
                                  item.productId,
                                  item.quantity
                                ).toFixed(2)}
                              </div>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() =>
                                    handleSaveForLater(item.productId)
                                  }
                                  className="text-sm text-blue-600 hover:text-blue-800"
                                >
                                  Save for later
                                </button>
                                <button
                                  onClick={() => removeItem(item.productId)}
                                  className="text-sm text-red-600 hover:text-red-800"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Saved for Later */}
                {savedItems.length > 0 && (
                  <div
                    className="mt-6 rounded-lg shadow-sm overflow-hidden"
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  >
                    <div
                      className="px-6 py-4"
                      style={{
                        borderBottom: "1px solid var(--sidebar-border)",
                      }}
                    >
                      <h2
                        className="text-lg font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        Saved for Later
                      </h2>
                    </div>
                    <div
                      style={{ borderTop: "1px solid var(--sidebar-border)" }}
                    >
                      {savedItems.map((productId) => {
                        const product = getProduct(productId);
                        if (!product) {
                          return null; // Skip items without product data
                        }
                        return (
                          <div key={productId} className="p-6">
                            <div className="flex items-center space-x-4">
                              <div className="flex-shrink-0">
                                {product?.image_url ? (
                                  <Image
                                    src={product.image_url}
                                    alt={product.name}
                                    width={60}
                                    height={60}
                                    className="w-15 h-15 object-cover rounded-lg"
                                  />
                                ) : (
                                  <div className="w-15 h-15 bg-gray-100 rounded-lg flex items-center justify-center">
                                    <span className="text-lg">🍎</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1">
                                <h3
                                  className="text-sm font-medium"
                                  style={{ color: "var(--foreground)" }}
                                >
                                  {product?.name || "Product"}
                                </h3>
                                <div
                                  className="text-sm"
                                  style={{
                                    color: "var(--foreground)",
                                    opacity: 0.6,
                                  }}
                                >
                                  £{product?.price}
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleMoveToCart(productId)}
                                  className="text-sm text-blue-600 hover:text-blue-800"
                                >
                                  Move to cart
                                </button>
                                <button
                                  onClick={() =>
                                    setSavedItems((prev) =>
                                      prev.filter((id) => id !== productId)
                                    )
                                  }
                                  className="text-sm text-red-600 hover:text-red-800"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {recommendations.length > 0 && (
                  <div
                    className="mt-6 rounded-lg shadow-sm overflow-hidden"
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  >
                    <div
                      className="px-6 py-4"
                      style={{
                        borderBottom: "1px solid var(--sidebar-border)",
                      }}
                    >
                      <h2
                        className="text-lg font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        You might also like
                      </h2>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {recommendations.map((product) => (
                          <div key={product.id} className="text-center">
                            <div className="aspect-square mb-2">
                              {product.image_url ? (
                                <Image
                                  src={product.image_url}
                                  alt={product.name}
                                  width={120}
                                  height={120}
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center">
                                  <span className="text-2xl">🍎</span>
                                </div>
                              )}
                            </div>
                            <h3
                              className="text-sm font-medium truncate"
                              style={{ color: "var(--foreground)" }}
                            >
                              {product.name}
                            </h3>
                            <p
                              className="text-sm"
                              style={{
                                color: "var(--foreground)",
                                opacity: 0.6,
                              }}
                            >
                              £{product.price}
                            </p>
                            <button
                              onClick={() => addToCart(product.id, 1)}
                              className="mt-2 w-full px-3 py-1 text-xs font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
                            >
                              Add to cart
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Order Summary */}
              <div className="mt-8 lg:mt-0 lg:col-span-4">
                <div
                  className="rounded-lg shadow-sm"
                  style={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--sidebar-border)",
                  }}
                >
                  <div
                    className="px-6 py-4"
                    style={{ borderBottom: "1px solid var(--sidebar-border)" }}
                  >
                    <h2
                      className="text-lg font-medium"
                      style={{ color: "var(--foreground)" }}
                    >
                      Order Summary
                    </h2>
                  </div>
                  <div className="p-6 space-y-4">
                    {/* Coupon Code */}
                    <div>
                      <label
                        htmlFor="coupon"
                        className="block text-sm font-medium mb-2"
                        style={{ color: "var(--foreground)" }}
                      >
                        Coupon Code
                      </label>
                      {appliedCoupon ? (
                        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                          <div className="flex items-center">
                            <svg
                              className="w-5 h-5 text-green-500 mr-2"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="text-sm font-medium text-green-800">
                              {appliedCoupon} applied
                            </span>
                          </div>
                          <button
                            onClick={handleRemoveCoupon}
                            className="text-sm text-green-600 hover:text-green-800"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="flex">
                          <input
                            type="text"
                            id="coupon"
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value)}
                            placeholder="Enter coupon code"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            onClick={handleApplyCoupon}
                            className="px-4 py-2 bg-gray-600 text-white rounded-r-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                          >
                            Apply
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Price Breakdown */}
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span
                          style={{ color: "var(--foreground)", opacity: 0.7 }}
                        >
                          Subtotal
                        </span>
                        <span
                          className="font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          £{subtotal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span
                          style={{ color: "var(--foreground)", opacity: 0.7 }}
                        >
                          Shipping
                        </span>
                        <span
                          className="font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          {shipping === 0 ? "Free" : `£${shipping.toFixed(2)}`}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span
                          style={{ color: "var(--foreground)", opacity: 0.7 }}
                        >
                          Tax (VAT)
                        </span>
                        <span
                          className="font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          £{tax.toFixed(2)}
                        </span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Discount</span>
                          <span>-£{discount.toFixed(2)}</span>
                        </div>
                      )}
                      <div
                        className="pt-3"
                        style={{ borderTop: "1px solid var(--sidebar-border)" }}
                      >
                        <div className="flex justify-between text-lg font-semibold">
                          <span style={{ color: "var(--foreground)" }}>
                            Total
                          </span>
                          <span style={{ color: "var(--foreground)" }}>
                            £{total.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Trust Signals */}
                    <div
                      className="pt-4"
                      style={{ borderTop: "1px solid var(--sidebar-border)" }}
                    >
                      <div
                        className="flex items-center space-x-4 text-sm"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        <div className="flex items-center">
                          <svg
                            className="w-4 h-4 mr-1"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Secure checkout
                        </div>
                        <div className="flex items-center">
                          <svg
                            className="w-4 h-4 mr-1"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          30-day returns
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3 pt-4">
                      <button className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                        Proceed to Checkout (
                        {cart.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                        items)
                      </button>
                      <button
                        className="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 transition-colors"
                        onClick={clearCart}
                      >
                        Clear Cart
                      </button>
                      <Link
                        href="/"
                        className="block w-full text-center py-2 px-4 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        Continue Shopping
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
