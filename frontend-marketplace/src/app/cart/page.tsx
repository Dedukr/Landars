"use client";
import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import CheckoutProgress from "@/components/CheckoutProgress";
import CartItemsList from "@/components/CartItemsList";
import ProductRecommendations from "@/components/ProductRecommendations";
import SubtotalDisplay from "@/components/cart/SubtotalDisplay";
import TotalDisplay from "@/components/cart/TotalDisplay";
import DiscountDisplay from "@/components/cart/DiscountDisplay";
import CartItemsCountDisplay from "@/components/cart/CartItemsCountDisplay";
import CheckoutButton from "@/components/cart/CheckoutButton";
import { useCartOptimized } from "@/hooks/useCartOptimized";
import { useCartItems } from "@/hooks/useCartItems";
import { useDeliveryFee } from "@/hooks/useDeliveryFee";
import { useCartCalculations } from "@/hooks/useCartCalculations";
import { httpClient } from "@/utils/httpClient";

interface CartData {
  id: number;
  items: Array<{
    id: number;
    product: number;
    product_name: string;
    product_price: string;
    quantity: string;
    total_price: string;
    added_date: string;
  }>;
  notes?: string;
  delivery_date?: string | null;
  is_home_delivery?: boolean;
  delivery_fee?: string;
  discount?: string;
  sum_price?: string;
  total_price?: string;
  total_items?: number;
  created_at?: string;
  updated_at?: string;
}

export default function CartPage() {
  const { user } = useAuth();
  const {
    products,
    loading: productsLoading,
    clearCart,
    cart,
  } = useCartOptimized();
  const {
    filteredProducts,
    removingIds,
    removeItem,
    decreaseQuantity,
    increaseQuantity,
  } = useCartItems(products);
  const { addToCart, isLoading: cartIsLoading } = useCart();
  const [savedItems, setSavedItems] = useState<number[]>([]);
  const [cartData, setCartData] = useState<CartData | null>(null);

  // Fetch cart data with metadata
  const fetchCartData = useCallback(async () => {
    if (!user) return;

    try {
      const data = await httpClient.get<CartData>("/api/cart/");
      setCartData(data);
    } catch (error) {
      console.error("Failed to fetch cart data:", error);
    }
  }, [user]);

  // Fetch cart data when component mounts
  useEffect(() => {
    if (user) {
      fetchCartData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Create a stable key from cart items to detect actual changes
  const cartKey = useMemo(() => {
    return cart
      .map((item) => `${item.productId}:${item.quantity}`)
      .sort()
      .join(",");
  }, [cart]);

  // Refetch cart data when cart items change to get updated delivery fee
  // This ensures delivery fee is recalculated and displayed after items are added/updated/removed
  useEffect(() => {
    if (!user || cartIsLoading) return;

    const timeoutId = setTimeout(() => {
      fetchCartData();
    }, 500); // Debounce by 500ms to batch rapid changes

    return () => clearTimeout(timeoutId);
  }, [cartKey, user, fetchCartData, cartIsLoading]);

  // Use optimized cart calculations
  const { subtotal, totalItems, cartProducts } = useCartCalculations(
    filteredProducts,
    cart
  );

  // Use discount from cart data
  const discount = cartData?.discount ? parseFloat(cartData.discount) : 0;

  // Calculate delivery type for display (to show Post Delivery indicator)
  const { deliveryCalculation } = useDeliveryFee({
    products: cartProducts,
    subtotal: subtotal,
    discount: discount,
  });

  // Calculate total based only on product prices (subtotal - discount, no delivery fee)
  const total = subtotal - discount;

  const handleSaveForLater = useCallback(
    (productId: number) => {
      setSavedItems((prev) => [...prev, productId]);
      removeItem(productId);
    },
    [removeItem]
  );

  const handleMoveToCart = (productId: number) => {
    setSavedItems((prev) => prev.filter((id) => id !== productId));
    addToCart(productId, 1);
  };

  function getProduct(productId: number) {
    return products.find((p) => p && p.id === productId);
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            Shopping Cart
          </h1>
          <CartItemsCountDisplay totalItems={totalItems} />
        </div>

        {productsLoading && cart.length === 0 ? (
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
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors"
              style={{
                background: "var(--primary)",
                color: "white",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--primary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--primary)";
              }}
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
              steps={["Cart", "Shipping & Payment", "Review"]}
            />

            <div className="lg:grid lg:grid-cols-12 lg:gap-x-12 lg:items-start">
              {/* Cart Items */}
              <div className="lg:col-span-8">
                <CartItemsList
                  products={filteredProducts}
                  cart={cart}
                  removingIds={removingIds}
                  onRemove={removeItem}
                  onDecreaseQuantity={decreaseQuantity}
                  onIncreaseQuantity={increaseQuantity}
                  onSaveForLater={handleSaveForLater}
                />

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
                                  <div
                                    className="w-15 h-15 rounded-lg flex items-center justify-center"
                                    style={{ background: "var(--sidebar-bg)" }}
                                  >
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
                                  £
                                  {product?.price
                                    ? parseFloat(product.price).toFixed(2)
                                    : "0.00"}
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleMoveToCart(productId)}
                                  className="text-sm"
                                  style={{ color: "var(--primary)" }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = "0.8";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = "1";
                                  }}
                                >
                                  Move to cart
                                </button>
                                <button
                                  onClick={() =>
                                    setSavedItems((prev) =>
                                      prev.filter((id) => id !== productId)
                                    )
                                  }
                                  className="text-sm"
                                  style={{ color: "var(--destructive)" }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = "0.8";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = "1";
                                  }}
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
                <ProductRecommendations
                  excludeProducts={filteredProducts}
                  limit={4}
                  title="You might also like"
                  showWishlist={false}
                  showQuickAdd={true}
                  gridCols={{ default: 2, md: 4 }}
                  className="mt-6"
                />
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
                    {/* Delivery Type Information */}
                    <div
                      className="p-3 rounded-md"
                      style={{
                        background: "var(--info-bg)",
                        border: "1px solid var(--info-border)",
                      }}
                    >
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <span className="text-lg mr-2">
                            {deliveryCalculation.isHomeDelivery ? "🏠" : "📦"}
                          </span>
                        </div>
                        <div>
                          <h4
                            className="text-sm font-medium"
                            style={{ color: "var(--info-text)" }}
                          >
                            {deliveryCalculation.isHomeDelivery
                              ? "Home Delivery"
                              : "Post Delivery"}
                          </h4>
                          <p
                            className="text-xs mt-1"
                            style={{ color: "var(--info-text)", opacity: 0.9 }}
                          >
                            {deliveryCalculation.isHomeDelivery
                              ? "This order will be delivered directly to your address."
                              : "This order is suitable for Royal Mail post delivery."}
                          </p>
                        </div>
                      </div>
                      {deliveryCalculation.totalWeight > 0 && (
                        <p
                          className="mt-2 text-xs"
                          style={{ color: "var(--info-text)", opacity: 0.9 }}
                        >
                          Estimated parcel weight:{" "}
                          {deliveryCalculation.totalWeight.toFixed(1)}kg
                        </p>
                      )}
                    </div>

                    {/* Free delivery progress for sausage-only post orders */}
                    {deliveryCalculation.hasSausages &&
                      !deliveryCalculation.isHomeDelivery &&
                      !deliveryCalculation.overweight &&
                      subtotal < 220 && (
                        <div
                          className="p-3 rounded-md"
                          style={{
                            background: "var(--success-bg)",
                            border: "1px solid var(--success-border)",
                          }}
                        >
                          <p
                            className="text-sm font-medium"
                            style={{ color: "var(--success-text)" }}
                          >
                            Spend{" "}
                            <span className="font-semibold">
                              £{(220 - subtotal).toFixed(2)}
                            </span>{" "}
                            more to qualify for free post delivery on sausages
                            (orders over £220).
                          </p>
                        </div>
                      )}

                    {/* Perishable content notice for sausages */}
                    {deliveryCalculation.hasSausages && (
                      <div
                        className="p-3 rounded-md"
                        style={{
                          background: "var(--info-bg)",
                          border: "1px solid var(--info-border)",
                        }}
                      >
                        <p
                          className="text-xs"
                          style={{ color: "var(--info-text)", opacity: 0.9 }}
                        >
                          This order contains chilled sausages and marinated
                          products. Please ensure someone is available to
                          receive the delivery promptly.
                        </p>
                      </div>
                    )}

                    {/* Order Summary - Products only (no delivery fee) */}
                    <div className="space-y-3">
                      <SubtotalDisplay subtotal={subtotal} />

                      {/* Discount */}
                      <DiscountDisplay discount={discount} />

                      {/* Total - Products only: subtotal - discount */}
                      <TotalDisplay total={total} />
                    </div>

                    {/* Trust Signals */}
                    <div
                      className="pt-4"
                      style={{ borderTop: "1px solid var(--sidebar-border)" }}
                    >
                      <div
                        className="flex items-center text-sm"
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
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3 pt-4">
                      <CheckoutButton totalItems={totalItems} />
                      <button
                        className="w-full py-2 px-4 rounded transition-colors"
                        style={{
                          background: "var(--destructive)",
                          color: "white",
                        }}
                        onClick={clearCart}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = "0.8";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = "1";
                        }}
                      >
                        Clear Cart
                      </button>
                      <Link
                        href="/"
                        className="block w-full text-center py-2 px-4 rounded transition-colors"
                        style={{
                          border: "1px solid var(--sidebar-border)",
                          color: "var(--foreground)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "var(--sidebar-bg)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
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
