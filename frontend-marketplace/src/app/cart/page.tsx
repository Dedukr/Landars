"use client";
import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import CheckoutProgress from "@/components/CheckoutProgress";
import CartItemsList from "@/components/CartItemsList";
import ProductRecommendations from "@/components/ProductRecommendations";
import DeliveryFeeInfo from "@/components/DeliveryFeeInfo";
import SubtotalDisplay from "@/components/cart/SubtotalDisplay";
import DeliveryFeeDisplay from "@/components/cart/DeliveryFeeDisplay";
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
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<number[]>([]);
  const [cartData, setCartData] = useState<CartData | null>(null);

  // Fetch cart data with metadata
  const fetchCartData = useCallback(async () => {
    if (!user) return;

    try {
      const data = await httpClient.get<CartData>("/api/cart/");
      setCartData(data);

      // If cart has discount, set applied coupon
      if (data.discount && parseFloat(data.discount) > 0) {
        setAppliedCoupon("save10"); // Assume save10 if discount exists
      }
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

  // Use discount from cart if available, otherwise calculate from applied coupon
  // If coupon is applied but cart discount doesn't match current subtotal, recalculate
  const calculatedDiscount = appliedCoupon ? subtotal * 0.1 : 0;
  const cartDiscount = cartData?.discount ? parseFloat(cartData.discount) : 0;

  // Update cart discount if coupon is applied and discount doesn't match
  // Debounce to prevent excessive API calls; no refetch to avoid cascades
  useEffect(() => {
    if (cartIsLoading) return; // Skip during cart updates

    if (appliedCoupon && user && subtotal > 0) {
      const expectedDiscount = subtotal * 0.1;
      if (Math.abs(cartDiscount - expectedDiscount) > 0.01) {
        const timeoutId = setTimeout(async () => {
          try {
            await httpClient.put("/api/cart/", {
              discount: expectedDiscount,
            });
            // Update local cartData to avoid extra refetch
            setCartData((prev) =>
              prev ? { ...prev, discount: expectedDiscount.toString() } : prev
            );
          } catch (error) {
            console.error("Failed to update discount:", error);
          }
        }, 800); // Gentle debounce to batch updates

        return () => clearTimeout(timeoutId);
      }
    }
  }, [subtotal, appliedCoupon, user, cartDiscount, cartIsLoading]);

  const discount = cartDiscount > 0 ? cartDiscount : calculatedDiscount;

  // Dynamic delivery fee calculation
  const { deliveryCalculation, deliveryBreakdown } = useDeliveryFee({
    products: cartProducts,
    subtotal: subtotal,
    discount: discount,
  });

  // Use backend's preassigned delivery fee (calculated using Royal Mail map)
  // Backend automatically calculates delivery fee when items are added/updated
  const cartDeliveryFee = cartData?.delivery_fee
    ? parseFloat(cartData.delivery_fee)
    : 0;
  const cartIsHomeDelivery = cartData?.is_home_delivery ?? true;

  // Use backend delivery fee if available, otherwise fall back to frontend calculation
  const displayDeliveryFee =
    cartDeliveryFee > 0 ? cartDeliveryFee : deliveryCalculation.deliveryFee;
  const displayIsHomeDelivery = cartData
    ? cartIsHomeDelivery
    : deliveryCalculation.isHomeDelivery;

  // Calculate total using backend delivery fee (preassigned Royal Mail pricing)
  const total = subtotal + displayDeliveryFee - discount;

  const handleApplyCoupon = async () => {
    if (
      typeof couponCode === "string" &&
      couponCode.toLowerCase() === "save10"
    ) {
      const discountAmount = subtotal * 0.1; // 10% discount

      try {
        // Save discount to cart
        await httpClient.put("/api/cart/", {
          discount: discountAmount,
        });

        setAppliedCoupon(couponCode);
        setCouponCode("");

        // Refetch cart data to get updated values
        await fetchCartData();
      } catch (error) {
        console.error("Failed to apply coupon:", error);
      }
    }
  };

  const handleRemoveCoupon = async () => {
    try {
      // Remove discount from cart
      await httpClient.put("/api/cart/", {
        discount: 0,
      });

      setAppliedCoupon(null);

      // Refetch cart data to get updated values
      await fetchCartData();
    } catch (error) {
      console.error("Failed to remove coupon:", error);
    }
  };

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
                    {!deliveryCalculation.isHomeDelivery && (
                      <div
                        className="p-3 rounded-md"
                        style={{
                          background: "var(--info-bg)",
                          border: "1px solid var(--info-border)",
                        }}
                      >
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <span className="text-lg mr-2">📦</span>
                          </div>
                          <div>
                            <h4
                              className="text-sm font-medium"
                              style={{ color: "var(--info-text)" }}
                            >
                              Post Delivery
                            </h4>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Delivery Fee Information */}
                    <DeliveryFeeInfo />

                    {/* Delivery Date - Based on Order Model */}
                    {/* <div className="space-y-2">
                      <label
                        htmlFor="deliveryDate"
                        className="block text-sm font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        Delivery Date
                      </label>
                      <input
                        type="date"
                        id="deliveryDate"
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
                        style={{
                          background: "var(--card-bg)",
                          color: "var(--foreground)",
                          border: "1px solid var(--sidebar-border)",
                        }}
                      />
                    </div> */}

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
                        <div
                          className="flex items-center justify-between p-3 rounded-md"
                          style={{
                            background: "var(--success-bg)",
                            border: "1px solid var(--success-border)",
                          }}
                        >
                          <div className="flex items-center">
                            <svg
                              className="w-5 h-5 mr-2"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              style={{ color: "var(--success)" }}
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span
                              className="text-sm font-medium"
                              style={{ color: "var(--success-text)" }}
                            >
                              {appliedCoupon} applied
                            </span>
                          </div>
                          <button
                            onClick={handleRemoveCoupon}
                            className="text-sm"
                            style={{ color: "var(--success)" }}
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
                      ) : (
                        <div className="flex">
                          <input
                            type="text"
                            id="coupon"
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value)}
                            placeholder="Enter coupon code"
                            className="flex-1 px-3 py-2 rounded-l-md focus:outline-none focus:ring-2 focus:border-transparent"
                            style={{
                              background: "var(--card-bg)",
                              color: "var(--foreground)",
                              border: "1px solid var(--sidebar-border)",
                            }}
                          />
                          <button
                            onClick={handleApplyCoupon}
                            className="px-4 py-2 rounded-r-md focus:outline-none focus:ring-2"
                            style={{
                              background: "var(--primary)",
                              color: "white",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--primary-hover)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background =
                                "var(--primary)";
                            }}
                          >
                            Apply
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Order Summary - Matching Order Model */}
                    <div className="space-y-3">
                      <SubtotalDisplay subtotal={subtotal} />

                      {/* Dynamic Delivery Fee - Based on Order Model Logic */}
                      <DeliveryFeeDisplay
                        deliveryFee={displayDeliveryFee}
                        isFree={displayDeliveryFee === 0}
                        reasoning={
                          deliveryBreakdown.overweight
                            ? deliveryBreakdown.reasoning
                            : displayDeliveryFee === 0
                            ? "Free delivery for orders over £220"
                            : displayIsHomeDelivery
                            ? "Home delivery"
                            : `Royal Mail post delivery (weight-based)`
                        }
                        hasSausages={!displayIsHomeDelivery}
                        weight={deliveryBreakdown.weight}
                        dependsOnCourier={
                          deliveryBreakdown.dependsOnCourier ||
                          deliveryBreakdown.overweight
                        }
                        overweight={deliveryBreakdown.overweight}
                      />

                      {/* Discount - Based on Order Model */}
                      <DiscountDisplay discount={discount} />

                      {/* Total - Order Model Calculation: sum_price + delivery_fee - discount 
                          Based on Order.total_price = sum_price + delivery_fee - discount
                          Admin logic: 
                          - Sausages: is_home_delivery=False, weight-based fees (≤2kg=£5, ≤10kg=£8, >10kg=£15)
                          - Other products: is_home_delivery=True, delivery_fee=£10
                          - Free delivery if total > £220
                      */}
                      <TotalDisplay total={total} />
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
