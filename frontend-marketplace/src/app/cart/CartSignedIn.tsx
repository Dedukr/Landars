"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useCart } from "@/contexts/CartContext";
import CheckoutProgress from "@/components/CheckoutProgress";
import ProductRecommendations from "@/components/ProductRecommendations";
import { useCartOptimized } from "@/hooks/useCartOptimized";
import { useCartItems } from "@/hooks/useCartItems";
import { useDeliveryFee } from "@/hooks/useDeliveryFee";
import { useCartCalculations } from "@/hooks/useCartCalculations";
import { normalizeListResponse } from "@/components/shop/normalizeListResponse";
import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import { fetchCategoryGroups } from "@/lib/fetchCategoryGroups";
import { findPostDeliveryCategoryGroup } from "@/lib/categoryGroups";
import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";
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

export default function CartSignedIn() {
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
  const [postDeliveryGroup, setPostDeliveryGroup] =
    useState<ApiCategoryGroup | null>(null);
  const [categoryRecords, setCategoryRecords] = useState<ShopCategoryRecord[]>(
    []
  );

  useEffect(() => {
    void (async () => {
      const [groups, categoriesRes] = await Promise.all([
        fetchCategoryGroups(),
        fetch("/api/categories/"),
      ]);
      setPostDeliveryGroup(findPostDeliveryCategoryGroup(groups));
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategoryRecords(normalizeListResponse<ShopCategoryRecord>(data));
      }
    })();
  }, []);

  const fetchCartData = useCallback(async () => {
    try {
      const data = await httpClient.get<CartData>("/api/cart/");
      setCartData(data);
    } catch (error) {
      console.error("Failed to fetch cart data:", error);
    }
  }, []);

  useEffect(() => {
    fetchCartData();
  }, [fetchCartData]);

  const cartKey = useMemo(() => {
    return cart
      .map((item) => `${item.productId}:${item.quantity}`)
      .sort()
      .join(",");
  }, [cart]);

  useEffect(() => {
    if (cartIsLoading) return;
    const timeoutId = setTimeout(() => {
      fetchCartData();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [cartKey, fetchCartData, cartIsLoading]);

  const { subtotal, cartProducts } = useCartCalculations(
    filteredProducts,
    cart
  );

  const discount = cartData?.discount ? parseFloat(cartData.discount) : 0;

  const { deliveryCalculation } = useDeliveryFee({
    products: cartProducts,
    subtotal,
    discount,
    postDeliveryGroup,
    categoryRecords,
    isHomeDeliveryFromCart: cartData?.is_home_delivery,
  });

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
        <CheckoutProgress
          currentStep={1}
          steps={["Your basket", "Delivery & details", "Review order"]}
        />

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

        {isInitialLoading && <CartLoadingState />}
        {isEmpty && <EmptyCartState />}

        {!isInitialLoading && !isEmpty && (
          <div className="lg:grid lg:grid-cols-12 lg:gap-x-8 lg:items-start">
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

      {!isInitialLoading && !isEmpty && (
        <MobileCartActionBar total={total} totalItems={visibleQuantitySum} />
      )}
    </div>
  );
}
