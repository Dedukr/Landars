import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/contexts/AuthContext";
import SignInPopup, { type SignInPopupVariant } from "./SignInPopup";
import { Button } from "@/components/ui/Button";
import { useInView } from "react-intersection-observer";
import { scopeProductsQueryString } from "@/utils/catalogScope";
import type { ShopListingFilters } from "@/types/shop-filters";
import { SHOP_PRICE_MAX_UNLIMITED } from "@/types/shop-filters";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import { ShopProductCardSkeleton } from "@/components/shop/ShopProductCardSkeleton";
import { ShopEmptyState, ShopErrorState } from "@/components/shop/ShopListingStates";

/** Product rows from `/api/products/` list serializer (+ optional extras). Future: `created_at`, `sales_count`. */
interface Product {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  categories?: string[];
  image_url?: string | null;
  images?: (string | { image_url: string })[];
  primary_image?: string | null;
  stock_quantity?: number;
}

interface PaginatedResponse {
  results: Product[];
  count: number;
  next: string | null;
  previous: string | null;
  limit: number;
  offset: number;
  timestamp?: number;
}

export type ShopListingMeta = {
  loading: boolean;
  error: boolean;
  totalCount: number;
  loadedCount: number;
  displayedCount: number;
  hasMoreRemote: boolean;
};

interface ProductGridProps {
  filters: ShopListingFilters;
  sort: string;
  search?: string;
  onListingMeta?: (meta: ShopListingMeta) => void;
}

const SKELETON_COUNT = 8;

function buildQuery(params: ShopListingFilters, sort: string, search: string | undefined, offset: number): string {
  const usp = new URLSearchParams();
  if (params.categories.length) {
    usp.append("categories", params.categories.join(","));
  }
  if (search) usp.append("search", search);
  if (params.inStock) usp.append("in_stock", "1");
  if (sort) usp.append("sort", sort);
  const [pMin, pMax] = params.price;
  if (pMin > 0) {
    usp.append("price_min", String(pMin));
  }
  if (pMax < SHOP_PRICE_MAX_UNLIMITED) {
    usp.append("price_max", String(pMax));
  }
  usp.append("limit", "50");
  usp.append("offset", String(offset));
  return scopeProductsQueryString(usp.toString());
}

const ProductGrid: React.FC<ProductGridProps> = ({
  filters,
  sort,
  search,
  onListingMeta,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, PaginatedResponse>>(new Map());
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [visibleProductsCount, setVisibleProductsCount] = useState(50);

  const { user } = useAuth();
  const [signInPopupVariant, setSignInPopupVariant] =
    useState<SignInPopupVariant | null>(null);

  const buildCachedKey = useCallback(
    (offset: number) => buildQuery(filters, sort, search, offset),
    [filters, sort, search]
  );

  const fetchProducts = useCallback(
    async (offset: number = 0, append: boolean = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const query = buildCachedKey(offset);
        const cacheKey = query;

        if (cacheRef.current.has(cacheKey)) {
          const cachedData = cacheRef.current.get(cacheKey)!;

          if (append) {
            setProducts((prev) => [...prev, ...cachedData.results]);
          } else {
            setProducts(cachedData.results);
          }

          setTotalCount(cachedData.count);
          setHasNextPage(!!cachedData.next);
          setCurrentOffset(offset);

          setLoading(false);
          setLoadingMore(false);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`/api/products/?${query}`, {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate, br",
          },
          signal: controller.signal,
          keepalive: true,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }

        const data: PaginatedResponse = await res.json();

        cacheRef.current.set(cacheKey, {
          ...data,
          timestamp: Date.now(),
        });

        if (cacheRef.current.size > 50) {
          const firstKey = cacheRef.current.keys().next().value;
          if (firstKey) cacheRef.current.delete(firstKey);
        }

        if (data.next && !append) {
          const nextParams = buildCachedKey(offset + 50);
          const nextCacheKey = nextParams;
          if (!cacheRef.current.has(nextCacheKey)) {
            setTimeout(() => {
              fetch(`/api/products/?${nextParams}`, {
                headers: { Accept: "application/json" },
                keepalive: true,
              })
                .then((res) => res.json())
                .then((pData) => {
                  cacheRef.current.set(nextCacheKey, {
                    ...pData,
                    timestamp: Date.now(),
                  });
                })
                .catch(() => {});
            }, 200);
          }
        }

        if (append) {
          setProducts((prev) => [...prev, ...data.results]);
        } else {
          setProducts(data.results);
        }

        setTotalCount(data.count);
        setHasNextPage(!!data.next);
        setCurrentOffset(offset);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          console.warn("Products request aborted");
        } else {
          console.error("Error fetching products:", err);
          setError("Unable to load products.");
        }
        if (!append) {
          setProducts([]);
          setTotalCount(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildCachedKey]
  );

  const retry = useCallback(() => {
    cacheRef.current.clear();
    fetchProducts(0, false);
  }, [fetchProducts]);

  const loadMoreProducts = useCallback(() => {
    if (!loadingMore && hasNextPage) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        const nextOffset = currentOffset + 50;
        fetchProducts(nextOffset, true);
      }, 50);
    }
  }, [loadingMore, hasNextPage, currentOffset, fetchProducts]);

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.1,
    rootMargin: "400px",
    triggerOnce: false,
  });

  useEffect(() => {
    if (inView && hasNextPage && !loadingMore) {
      loadMoreProducts();
    }
  }, [inView, hasNextPage, loadingMore, loadMoreProducts]);

  /** After remote pages append, reveal new rows so infinite scroll works without extra “Show more” clicks. */
  useEffect(() => {
    if (loadingMore) return;
    setVisibleProductsCount((prev) =>
      products.length > prev ? products.length : prev
    );
  }, [products.length, loadingMore]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setProducts([]);
    setCurrentOffset(0);
    setHasNextPage(true);
    setVisibleProductsCount(50);
    cacheRef.current.clear();
    fetchProducts(0, false);
  }, [filters, sort, search, fetchProducts]);

  const visibleProducts = products.slice(0, visibleProductsCount);
  const hasMoreProducts = products.length > visibleProductsCount;

  const showingFrom = products.length ? 1 : 0;
  const showingTo = Math.min(visibleProductsCount, products.length);

  useEffect(() => {
    onListingMeta?.({
      loading,
      error: Boolean(error && !loading),
      totalCount,
      loadedCount: products.length,
      displayedCount: visibleProducts.length,
      hasMoreRemote: hasNextPage,
    });
  }, [
    onListingMeta,
    loading,
    error,
    totalCount,
    products.length,
    visibleProducts.length,
    hasNextPage,
  ]);

  const ProductTile = React.memo(function ProductTile({
    product,
    loggedInUser,
  }: {
    product: Product;
    loggedInUser: ReturnType<typeof useAuth>["user"];
  }) {
    const { cart, addToCart, removeFromCart } = useCart();
    const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();

    const cartItem = cart.find((item) => item.productId === product.id);

    const inWishlist = isInWishlist(product.id);

    const handleWishlistToggle = React.useCallback(() => {
      if (!loggedInUser) {
        setSignInPopupVariant("wishlist");
        return;
      }
      if (inWishlist) removeFromWishlist(product.id);
      else addToWishlist(product.id);
    }, [loggedInUser, inWishlist, removeFromWishlist, addToWishlist, product.id]);

    const handleAddToCart = React.useCallback(
      (e?: React.MouseEvent) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        if (!loggedInUser) {
          setSignInPopupVariant("cart");
          return;
        }
        addToCart(product.id, 1);
      },
      [loggedInUser, addToCart, product.id]
    );

    const handleRemoveFromCart = React.useCallback(
      (e?: React.MouseEvent) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        if (!loggedInUser) return;
        removeFromCart(product.id);
      },
      [loggedInUser, removeFromCart, product.id]
    );

    return (
      <ShopProductCard
        product={product}
        user={loggedInUser}
        cartItemQuantity={cartItem?.quantity ?? 0}
        inWishlist={inWishlist}
        onWishlistToggle={handleWishlistToggle}
        onAddToCart={handleAddToCart}
        onRemoveFromCart={handleRemoveFromCart}
      />
    );
  });
  ProductTile.displayName = "ProductTile";

  const showBlockingError = Boolean(error && !loading);
  const showEmpty = !loading && !showBlockingError && totalCount === 0;

  function handleClearFiltersViaEvent() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("clear-filters"));
    }
  }

  return (
    <section aria-label="Product catalogue">
      {/* Result summary */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm tabular-nums">
        <p style={{ color: "var(--muted-foreground)" }}>
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block size-4 rounded-full animate-spin border-2 shrink-0"
                style={{
                  borderColor: "var(--sidebar-border)",
                  borderTopColor: "var(--accent)",
                }}
                aria-hidden
              />
              Loading products…
            </span>
          ) : showBlockingError ? (
            <span style={{ color: "var(--destructive)" }}>Something went wrong.</span>
          ) : totalCount === 0 ? (
            <span>No matching products</span>
          ) : (
            <span>
              Showing{" "}
              <span style={{ fontWeight: 700, color: "var(--foreground)" }}>
                {showingFrom}–{showingTo}
              </span>
              {" of "}
              <span style={{ fontWeight: 700, color: "var(--foreground)" }}>{totalCount}</span>
              {hasNextPage ? " • Keep scrolling for more" : ""}
            </span>
          )}
        </p>
      </div>

      {showBlockingError && (
        <div className="mb-10">
          <ShopErrorState onRetry={retry} />
        </div>
      )}

      {showEmpty && (
        <div className="mb-10">
          <ShopEmptyState onResetFilters={handleClearFiltersViaEvent} />
        </div>
      )}

      {!showBlockingError && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
          {loading
            ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <ShopProductCardSkeleton key={i} />
              ))
            : visibleProducts.map((product) => (
                <ProductTile key={product.id} product={product} loggedInUser={user} />
              ))}
        </div>
      )}

      {hasMoreProducts && !loadingMore && !showBlockingError && !loading && (
        <div className="flex justify-center py-8">
          <Button
            variant="outline"
            onClick={() => {
              setVisibleProductsCount((prev) =>
                Math.min(prev + 50, products.length)
              );
            }}
            className="px-8 py-3"
          >
            Show more from this search
          </Button>
        </div>
      )}

      {hasNextPage && !hasMoreProducts && !showBlockingError && !loading && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore ? (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              <div
                className="animate-spin rounded-full h-4 w-4 border-2"
                style={{
                  borderColor: "var(--sidebar-border)",
                  borderTopColor: "var(--accent)",
                }}
              />
              Loading more products…
            </div>
          ) : (
            <div
              className="text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              Scroll to load more
            </div>
          )}
        </div>
      )}

      {!hasNextPage && products.length > 0 && !showBlockingError && (
        <div className="flex justify-center py-8">
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            You&apos;ve reached the end of the catalogue
          </div>
        </div>
      )}

      <SignInPopup
        isOpen={signInPopupVariant !== null}
        variant={signInPopupVariant ?? "wishlist"}
        onClose={() => setSignInPopupVariant(null)}
      />
    </section>
  );
};

export default ProductGrid;
