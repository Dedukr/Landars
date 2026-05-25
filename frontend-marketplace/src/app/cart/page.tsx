"use client";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import CheckoutProgress from "@/components/CheckoutProgress";
import ProductRecommendations from "@/components/ProductRecommendations";
import { useCartOptimized } from "@/hooks/useCartOptimized";
import { useCartItems } from "@/hooks/useCartItems";
import { useDeliveryFee } from "@/hooks/useDeliveryFee";
import { useCartCalculations } from "@/hooks/useCartCalculations";
import { httpClient } from "@/utils/httpClient";

import CartHero from "@/components/cart/CartHero";
import CartItemList from "@/components/cart/CartItemList";
import CartSummary from "@/components/cart/CartSummary";
import EmptyCartState from "@/components/cart/EmptyCartState";
import CartLoadingState from "@/components/cart/CartLoadingState";
import MobileCartActionBar from "@/components/cart/MobileCartActionBar";
import SavedForLaterList from "@/components/cart/SavedForLaterList";

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

  const fetchCartData = useCallback(async () => {
    if (!user) return;
    try {
      const data = await httpClient.get<CartData>("/api/cart/");
      setCartData(data);
    } catch (error) {
      console.error("Failed to fetch cart data:", error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchCartData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const cartKey = useMemo(() => {
    return cart
      .map((item) => `${item.productId}:${item.quantity}`)
      .sort()
      .join(",");
  }, [cart]);

  useEffect(() => {
    if (!user || cartIsLoading) return;
    const timeoutId = setTimeout(() => {
      fetchCartData();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [cartKey, user, fetchCartData, cartIsLoading]);

  const { subtotal, cartProducts } = useCartCalculations(
    filteredProducts,
    cart
  );

  const discount = cartData?.discount ? parseFloat(cartData.discount) : 0;

  const { deliveryCalculation } = useDeliveryFee({
    products: cartProducts,
    subtotal,
    discount,
  });

  // Total shown in cart = subtotal - discount (delivery calculated at checkout)
  const total = subtotal - discount;

  const handleSaveForLater = useCallback(
    (productId: number) => {
      setSavedItems((prev) => [...prev, productId]);
      removeItem(productId);
    },
    [removeItem]
  );

  const handleMoveToCart = useCallback(
    (productId: number) => {
      setSavedItems((prev) => prev.filter((id) => id !== productId));
      addToCart(productId, 1);
    },
    [addToCart]
  );

  const handleRemoveSaved = useCallback((productId: number) => {
    setSavedItems((prev) => prev.filter((id) => id !== productId));
  }, []);

  function getProduct(productId: number) {
    return products.find((p) => p && p.id === productId);
  }

  const visibleQuantitySum = useMemo(
    () =>
      filteredProducts.reduce((sum, p) => {
        const row = cart.find((c) => c.productId === p.id);
        return sum + (row?.quantity ?? 0);
      }, 0),
    [filteredProducts, cart]
  );

  const visibleLineCount = filteredProducts.length;

  const cartQuantityTotal = useMemo(
    () => cart.reduce((sum, c) => sum + c.quantity, 0),
    [cart]
  );

  const isInitialLoading = productsLoading && cart.length === 0;
  const isEmpty = !productsLoading && cart.length === 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 sm:pb-8">
        {/* Checkout progress */}
        <CheckoutProgress
          currentStep={1}
          steps={["Your basket", "Delivery & details", "Review order"]}
        />

        {/* Page header */}
        <CartHero
          itemCount={visibleQuantitySum}
          lineCount={visibleLineCount}
          pendingQuantityTotal={
            cartQuantityTotal > visibleQuantitySum ? cartQuantityTotal : undefined
          }
          isLoading={productsLoading}
          isInitialLoading={isInitialLoading}
          isEmpty={isEmpty}
        />

        {/* Loading state */}
        {isInitialLoading && <CartLoadingState />}

        {/* Empty state */}
        {isEmpty && <EmptyCartState />}

        {/* Main cart content */}
        {!isInitialLoading && !isEmpty && (
          <div className="lg:grid lg:grid-cols-12 lg:gap-x-8 lg:items-start">
            {/* Left column row 1: items + saved */}
            <div className="lg:col-span-8 lg:col-start-1 lg:row-start-1 space-y-4">
              <CartItemList
                products={filteredProducts}
                cart={cart}
                removingIds={removingIds}
                onRemove={removeItem}
                onDecreaseQuantity={decreaseQuantity}
                onIncreaseQuantity={increaseQuantity}
                onSaveForLater={handleSaveForLater}
              />

              <SavedForLaterList
                savedItems={savedItems}
                getProduct={getProduct}
                onMoveToCart={handleMoveToCart}
                onRemoveSaved={handleRemoveSaved}
              />
            </div>

            {/* Right column row 1: sticky order summary (desktop) */}
            <div className="mt-6 lg:mt-0 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:sticky lg:top-6">
              <CartSummary
                subtotal={subtotal}
                discount={discount}
                total={total}
                totalItems={visibleQuantitySum}
                deliveryCalculation={deliveryCalculation}
                onClearCart={clearCart}
              />
            </div>

            {/* Recommendations: on mobile renders after the summary (source order);
                on desktop placed in row 2 under the items column. */}
            <div className="mt-6 lg:mt-4 lg:col-span-8 lg:col-start-1 lg:row-start-2">
              <ProductRecommendations
                excludeProducts={filteredProducts}
                limit={4}
                title="You might also like"
                showWishlist={false}
                showQuickAdd={true}
                gridCols={{ default: 2, md: 4 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sticky mobile action bar (hidden sm+) */}
      {!isInitialLoading && !isEmpty && (
        <MobileCartActionBar total={total} totalItems={visibleQuantitySum} />
      )}
    </div>
  );
}
