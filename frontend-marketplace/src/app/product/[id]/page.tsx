"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Heart, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCartItems } from "@/hooks/useCartItems";
import { useWishlistItems } from "@/hooks/useWishlistItems";
import { useAuth } from "@/contexts/AuthContext";
import SignInPopup from "@/components/SignInPopup";
import Breadcrumb from "@/components/Breadcrumb";
import ProductRecommendations from "@/components/ProductRecommendations";
import ProductReviewBlock from "@/components/ProductReviewBlock";
import { scopeProductsQueryString } from "@/utils/catalogScope";
import { Button } from "@/components/ui/Button";
import type { ProductDetail } from "@/components/product/types";
import { collectProductImageUrls } from "@/components/product/collectProductImageUrls";
import ProductDetailSkeleton from "@/components/product/ProductDetailSkeleton";
import ProductNotFoundState from "@/components/product/ProductNotFoundState";
import ProductImageGallery from "@/components/product/ProductImageGallery";
import ProductTrustStrip from "@/components/product/ProductTrustStrip";
import ProductDetailsAccordion from "@/components/product/ProductDetailsAccordion";
import MobileProductActionBar from "@/components/product/MobileProductActionBar";

type LoadState = { kind: "idle" } | { kind: "not_found" } | { kind: "failed" };

function normalizeDescription(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

function priceDisplay(price: string | undefined): string | null {
  if (price == null || price === "") return null;
  const n = parseFloat(String(price));
  return Number.isFinite(n) ? `£${n.toFixed(2)}` : null;
}

function stockUnavailable(product: ProductDetail): boolean {
  if (product.in_stock === false) return true;
  if (typeof product.stock_quantity === "number" && product.stock_quantity <= 0) return true;
  return false;
}

function lowStock(product: ProductDetail): boolean {
  if (typeof product.stock_quantity !== "number") return false;
  return product.stock_quantity > 0 && product.stock_quantity < 5;
}

export default function ProductPage() {
  const params = useParams();
  const { cart, addToCart, removeFromCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { user } = useAuth();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });
  const [showSignInPopup, setShowSignInPopup] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const { filteredProducts: cartItems } = useCartItems(products);
  const { filteredProducts: wishlistItems } = useWishlistItems(products);

  const rawId = params?.id;
  const productId = Array.isArray(rawId) ? rawId[0] : rawId;

  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await fetch(
          `/api/products/?${scopeProductsQueryString("limit=500&offset=0")}`
        );
        if (response.ok) {
          const data = await response.json();
          const fetched = Array.isArray(data) ? data : data.results || [];
          setProducts(fetched);
        }
      } catch {
        /* ignore — recommendations still work without full catalog */
      }
    }
    fetchProducts();
  }, []);

  const fetchProduct = React.useCallback(async () => {
    if (!productId || String(productId).trim() === "") {
      setProduct(null);
      setLoadState({ kind: "not_found" });
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadState({ kind: "idle" });
    try {
      const response = await fetch(`/api/products/${productId}/`);
      if (response.status === 404) {
        setProduct(null);
        setLoadState({ kind: "not_found" });
        return;
      }
      if (!response.ok) {
        setProduct(null);
        setLoadState({ kind: "failed" });
        return;
      }
      const data = (await response.json()) as ProductDetail;
      setProduct(data);
      setQuantity(1);
    } catch {
      setProduct(null);
      setLoadState({ kind: "failed" });
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  useEffect(() => {
    if (!product?.name) return;
    document.title = `${product.name} | Landar's Food`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    const desc = normalizeDescription(product.description);
    meta.setAttribute(
      "content",
      desc ? `${product.name} — ${desc.slice(0, 155)}` : `${product.name} — Landar's Food`
    );
  }, [product]);

  const imageUrls = useMemo(
    () => (product ? collectProductImageUrls(product) : []),
    [product]
  );
  const description = useMemo(
    () => (product ? normalizeDescription(product.description) : null),
    [product]
  );
  const priceStr = useMemo(() => (product ? priceDisplay(product.price) : null), [product]);
  const unavailable = useMemo(
    () => (product ? stockUnavailable(product) : true),
    [product]
  );
  const low = useMemo(() => (product ? lowStock(product) : false), [product]);
  const cartQuantity = useMemo(
    () => (product ? cart.find((item) => item.productId === product.id)?.quantity || 0 : 0),
    [cart, product]
  );
  const categoryBadge = useMemo(() => {
    if (!product) return null;
    return (
      product.category?.name?.trim() ||
      (product.categories && product.categories[0]?.trim()) ||
      null
    );
  }, [product]);

  const breadcrumbItems = useMemo(() => {
    if (!product) return [{ label: "Home", href: "/" }, { label: "Shop", href: "/shop/" }];
    return [
      { label: "Home", href: "/" },
      { label: "Shop", href: "/shop/" },
      ...(product.category?.id != null && product.category.name
        ? [
            {
              label: product.category.name,
              href: `/shop/?category=${product.category.id}`,
            } as const,
          ]
        : []),
      { label: product.name, href: "#" },
    ];
  }, [product]);

  const handleWishlistClick = () => {
    if (!user) {
      setShowSignInPopup(true);
      return;
    }
    if (!product) return;
    if (isInWishlist(product.id)) removeFromWishlist(product.id);
    else addToWishlist(product.id);
  };

  const handleAddToCart = () => {
    if (!product) return;
    if (stockUnavailable(product)) return;
    addToCart(product.id, quantity);
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity >= 1 && newQuantity <= 99) setQuantity(newQuantity);
  };

  if (loading) {
    return <ProductDetailSkeleton />;
  }

  if (loadState.kind === "failed") {
    return (
      <div
        className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16"
        style={{ background: "var(--background)" }}
      >
        <div
          className="max-w-md w-full rounded-2xl border p-8 text-center shadow-sm"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--sidebar-border)",
          }}
        >
          <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--foreground)" }}>
            Something went wrong
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
            We could not load this product. Please check your connection and try again.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="primary" size="md" onClick={() => void fetchProduct()}>
              Try again
            </Button>
            <Button variant="outline" size="md" asChild>
              <Link href="/shop/">Back to shop</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loadState.kind === "not_found" || !product) {
    return <ProductNotFoundState />;
  }

  return (
    <div
      className="min-h-screen pb-32 lg:pb-10"
      style={{ background: "var(--background)" }}
    >
      <div
        className="border-b"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <Link
            href="/shop/"
            className="inline-flex items-center gap-1.5 text-sm font-medium mb-3 lg:mb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-md"
            style={{ color: "var(--accent)" }}
          >
            ← Back to shop
          </Link>
          <Breadcrumb items={breadcrumbItems} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 lg:items-start">
          <div className="animate-fade-in">
            <ProductImageGallery key={product.id} imageUrls={imageUrls} productName={product.name} />
          </div>

          <div className="flex flex-col gap-4 lg:gap-5 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap gap-2 items-center min-w-0">
                {categoryBadge && (
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      background: "var(--sidebar-bg)",
                      color: "var(--foreground)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  >
                    {categoryBadge}
                  </span>
                )}
                {unavailable && (
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ background: "var(--destructive)", color: "white" }}
                  >
                    Unavailable
                  </span>
                )}
                {!unavailable && low && (
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{
                      background: "var(--info-bg)",
                      color: "var(--info-text)",
                      border: "1px solid var(--info-border)",
                    }}
                  >
                    Low stock
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleWishlistClick}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                style={{
                  borderColor: "var(--sidebar-border)",
                  background: "var(--card-bg)",
                  color: isInWishlist(product.id) ? "var(--destructive)" : "var(--muted-foreground)",
                  boxShadow: "var(--card-shadow)",
                }}
                aria-label={
                  user
                    ? isInWishlist(product.id)
                      ? "Remove from wishlist"
                      : "Save to wishlist"
                    : "Sign in to save to wishlist"
                }
                aria-pressed={isInWishlist(product.id)}
              >
                <Heart className={`h-5 w-5 ${isInWishlist(product.id) ? "fill-current" : ""}`} strokeWidth={2} />
              </button>
            </div>

            <h1
              className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-balance leading-tight"
              style={{ color: "var(--foreground)" }}
            >
              {product.name}
            </h1>

            {priceStr ? (
              <p className="text-3xl sm:text-4xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                {priceStr}
              </p>
            ) : (
              <p className="text-lg font-medium" style={{ color: "var(--muted-foreground)" }}>
                See details for pricing
              </p>
            )}

            {description && (
              <div
                className="rounded-2xl border p-4 sm:p-5"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--sidebar-border)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                  About this item
                </h2>
                <p
                  className="text-sm sm:text-base leading-relaxed line-clamp-6 lg:line-clamp-none whitespace-pre-wrap"
                  style={{ color: "var(--foreground)" }}
                >
                  {description}
                </p>
              </div>
            )}

            <div className="hidden lg:block space-y-4 pt-1">
              <div
                className="rounded-2xl border p-5 sm:p-6"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--sidebar-border)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>
                  Quantity
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity - 1)}
                      disabled={quantity <= 1 || unavailable}
                      className="flex h-11 w-11 items-center justify-center rounded-full border text-lg font-semibold disabled:opacity-40"
                      style={{
                        borderColor: "var(--sidebar-border)",
                        background: "var(--sidebar-bg)",
                        color: "var(--foreground)",
                      }}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span
                      className="min-w-[2.5rem] text-center text-base font-semibold tabular-nums"
                      style={{ color: "var(--foreground)" }}
                    >
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity + 1)}
                      disabled={quantity >= 99 || unavailable}
                      className="flex h-11 w-11 items-center justify-center rounded-full border text-lg font-semibold disabled:opacity-40"
                      style={{
                        borderColor: "var(--sidebar-border)",
                        background: "var(--sidebar-bg)",
                        color: "var(--foreground)",
                      }}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    className="min-w-[12rem] flex-1 sm:flex-none"
                    disabled={unavailable}
                    onClick={handleAddToCart}
                    icon={<ShoppingBag className="h-5 w-5" aria-hidden />}
                  >
                    {unavailable ? "Unavailable" : cartQuantity > 0 ? "Add more to basket" : "Add to basket"}
                  </Button>
                </div>
                {cartQuantity > 0 && (
                  <div
                    className="mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
                    style={{
                      background: "var(--info-bg)",
                      borderColor: "var(--info-border)",
                      color: "var(--info-text)",
                    }}
                  >
                    <span>
                      {cartQuantity} in your basket
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(product.id)}
                      className="font-medium underline underline-offset-2"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            <ProductTrustStrip />
          </div>
        </div>

        <div className="mt-8 lg:mt-10 max-w-3xl">
          <ProductDetailsAccordion product={product} />
        </div>

        <ProductRecommendations
          excludeProducts={[product, ...cartItems, ...wishlistItems] as ProductDetail[]}
          limit={4}
          className="mt-10 lg:mt-14"
        />

        <div className="mt-10 lg:mt-12">
          <ProductReviewBlock productId={product.id} />
        </div>
      </div>

      <MobileProductActionBar
        priceDisplay={priceStr}
        quantity={quantity}
        cartQuantity={cartQuantity}
        isAvailable={!unavailable}
        onQuantityChange={handleQuantityChange}
        onAddToCart={handleAddToCart}
        onRemoveFromBasket={() => removeFromCart(product.id)}
      />

      <SignInPopup isOpen={showSignInPopup} onClose={() => setShowSignInPopup(false)} />
    </div>
  );
}
