"use client";
import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";
import CheckoutProgress from "@/components/CheckoutProgress";
import CartItemsList from "@/components/CartItemsList";
import ProductRecommendations from "@/components/ProductRecommendations";
import DeliveryFeeInfo from "@/components/DeliveryFeeInfo";
import { useCartOptimized } from "@/hooks/useCartOptimized";
import { useCartItems } from "@/hooks/useCartItems";
import { useDeliveryFee } from "@/hooks/useDeliveryFee";

export default function CartPage() {
  const {
    products,
    loading: productsLoading,
    stats,
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
  const { addToCart } = useCart();
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<number[]>([]);

  const discount = appliedCoupon ? stats.subtotal * 0.1 : 0; // 10% discount for demo

  // Convert products to CartProduct format for delivery fee calculation
  const cartProducts = filteredProducts.map((product) => ({
    id: product.id,
    name: product.name,
    price: parseFloat(product.price),
    categories: product.categories || [],
    quantity: cart.find((item) => item.productId === product.id)?.quantity || 0,
  }));

  // Dynamic delivery fee calculation
  const {
    deliveryCalculation,
    deliveryBreakdown,
    totalPrice: calculatedTotal,
  } = useDeliveryFee({
    products: cartProducts,
    subtotal: stats.subtotal,
    discount: discount,
  });

  // Use calculated total instead of stats.total
  const total = calculatedTotal;

  const handleApplyCoupon = () => {
    if (couponCode.toLowerCase() === "save10") {
      setAppliedCoupon(couponCode);
      setCouponCode("");
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
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
              steps={["Cart", "Shipping", "Payment", "Review"]}
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
                                  £{product?.price}
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
                            {deliveryBreakdown.type}
                          </h4>
                          <p
                            className="text-sm"
                            style={{ color: "var(--info-text)", opacity: 0.8 }}
                          >
                            {deliveryBreakdown.reasoning}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Delivery Fee Information */}
                    <DeliveryFeeInfo />

                    {/* Delivery Date - Based on Order Model */}
                    <div className="space-y-2">
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
                    </div>

                    {/* Order Notes - Based on Order Model */}
                    <div className="space-y-2">
                      <label
                        htmlFor="orderNotes"
                        className="block text-sm font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        Order Notes (Optional)
                      </label>
                      <textarea
                        id="orderNotes"
                        rows={3}
                        placeholder="Any special instructions for your order..."
                        className="w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:border-transparent"
                        style={{
                          background: "var(--card-bg)",
                          color: "var(--foreground)",
                          border: "1px solid var(--sidebar-border)",
                        }}
                      />
                    </div>

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
                          £{stats.subtotal.toFixed(2)}
                        </span>
                      </div>

                      {/* Dynamic Delivery Fee - Based on Order Model Logic */}
                      <div className="flex justify-between text-sm">
                        <span
                          style={{ color: "var(--foreground)", opacity: 0.7 }}
                        >
                          Delivery Fee
                        </span>
                        <span
                          className="font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          {deliveryBreakdown.isFree
                            ? "Free"
                            : `£${deliveryCalculation.deliveryFee.toFixed(2)}`}
                        </span>
                      </div>

                      {/* Delivery Fee Breakdown */}
                      {deliveryCalculation.deliveryFee > 0 && (
                        <div
                          className="text-xs"
                          style={{ color: "var(--foreground)", opacity: 0.6 }}
                        >
                          {deliveryBreakdown.reasoning}
                          {deliveryBreakdown.hasSausages && (
                            <span>
                              {" "}
                              • Weight: {deliveryBreakdown.weight.toFixed(1)}kg
                            </span>
                          )}
                        </div>
                      )}

                      {/* Discount - Based on Order Model */}
                      {discount > 0 && (
                        <div
                          className="flex justify-between text-sm"
                          style={{ color: "var(--success)" }}
                        >
                          <span>Discount</span>
                          <span>-£{discount.toFixed(2)}</span>
                        </div>
                      )}

                      {/* Total - Order Model Calculation: sum_price + delivery_fee - discount 
                          Based on Order.total_price = sum_price + delivery_fee - discount
                          Admin logic: 
                          - Sausages: is_home_delivery=False, weight-based fees (≤2kg=£5, ≤10kg=£8, >10kg=£15)
                          - Other products: is_home_delivery=True, delivery_fee=£10
                          - Free delivery if total > £220
                      */}
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
                      <button
                        className="w-full py-3 px-4 rounded-lg font-semibold transition-colors"
                        style={{
                          background: "var(--primary)",
                          color: "white",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "var(--primary-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "var(--primary)";
                        }}
                      >
                        Proceed to Checkout ({stats.totalItems} items)
                      </button>
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
