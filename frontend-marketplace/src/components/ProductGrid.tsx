import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import SignInPopup, { type SignInPopupVariant } from "./SignInPopup";
import { Button } from "@/components/ui/Button";
import { useInView } from "react-intersection-observer";
import type { ShopListingFilters } from "@/types/shop-filters";
import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import ShopProductTile from "@/components/shop/ShopProductTile";
import { ShopProductCardSkeleton } from "@/components/shop/ShopProductCardSkeleton";
import { ShopEmptyState, ShopErrorState } from "@/components/shop/ShopListingStates";
import {
  SHOP_CATEGORY_SORT,
  SHOP_INITIAL_SORT,
} from "@/components/shop/shop-sort-options";
import {
  applyShopListingQuery,
  fetchAllShopProducts,
  prefetchShopProductImages,
  type ShopCatalogProduct,
} from "@/lib/shopCatalogClient";

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
  search?: string;
  categories: ShopCategoryRecord[];
  categoriesLoading?: boolean;
  onListingMeta?: (meta: ShopListingMeta) => void;
}

const SKELETON_COUNT = 8;
const PAGE_SIZE = 50;

const ProductGrid: React.FC<ProductGridProps> = ({
  filters,
  search,
  categories,
  categoriesLoading = false,
  onListingMeta,
}) => {
  const sort =
    filters.categories.length > 0 ? SHOP_CATEGORY_SORT : SHOP_INITIAL_SORT;
  const [catalog, setCatalog] = useState<ShopCatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const catalogLoadedRef = useRef(false);

  const [visibleProductsCount, setVisibleProductsCount] = useState(PAGE_SIZE);

  const { user } = useAuth();
  const [signInPopupVariant, setSignInPopupVariant] =
    useState<SignInPopupVariant | null>(null);

  const handleRequireSignIn = useCallback((variant: SignInPopupVariant) => {
    setSignInPopupVariant(variant);
  }, []);

  useEffect(() => {
    if (catalogLoadedRef.current) return;

    const controller = new AbortController();

    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const products = await fetchAllShopProducts(controller.signal);
        catalogLoadedRef.current = true;
        setCatalog(products);
        prefetchShopProductImages(products);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Error loading shop catalogue:", err);
        setCatalogError("Unable to load products.");
        setCatalog([]);
      } finally {
        setCatalogLoading(false);
      }
    }

    void loadCatalog();
    return () => controller.abort();
  }, []);

  const categoryFilterPending =
    filters.categories.length > 0 && categoriesLoading;
  const listLoading = catalogLoading || categoryFilterPending;

  const filteredProducts = useMemo(() => {
    if (categoryFilterPending) return [];
    return applyShopListingQuery(catalog, filters, sort, search, categories);
  }, [catalog, filters, sort, search, categories, categoryFilterPending]);

  useEffect(() => {
    setVisibleProductsCount(PAGE_SIZE);
  }, [filters, search, sort]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleProductsCount),
    [filteredProducts, visibleProductsCount]
  );

  const hasMoreProducts = filteredProducts.length > visibleProductsCount;
  const totalCount = filteredProducts.length;

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.1,
    rootMargin: "400px",
    triggerOnce: false,
  });

  useEffect(() => {
    if (inView && hasMoreProducts && !listLoading) {
      setVisibleProductsCount((prev) =>
        Math.min(prev + PAGE_SIZE, filteredProducts.length)
      );
    }
  }, [inView, hasMoreProducts, listLoading, filteredProducts.length]);

  const retry = useCallback(() => {
    catalogLoadedRef.current = false;
    setCatalog([]);
    setCatalogLoading(true);
    setCatalogError(null);

    void (async () => {
      try {
        const products = await fetchAllShopProducts();
        catalogLoadedRef.current = true;
        setCatalog(products);
        prefetchShopProductImages(products);
      } catch (err) {
        console.error("Error loading shop catalogue:", err);
        setCatalogError("Unable to load products.");
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, []);

  const showingFrom = visibleProducts.length ? 1 : 0;
  const showingTo = visibleProducts.length;

  useEffect(() => {
    onListingMeta?.({
      loading: listLoading,
      error: Boolean(catalogError && !listLoading),
      totalCount,
      loadedCount: catalog.length,
      displayedCount: visibleProducts.length,
      hasMoreRemote: hasMoreProducts,
    });
  }, [
    onListingMeta,
    listLoading,
    catalogError,
    totalCount,
    catalog.length,
    visibleProducts.length,
    hasMoreProducts,
  ]);

  const showBlockingError = Boolean(catalogError && !listLoading);
  const showEmpty = !listLoading && !showBlockingError && totalCount === 0;

  function handleClearFiltersViaEvent() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("clear-filters"));
    }
  }

  return (
    <section aria-label="Product catalogue">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm tabular-nums">
        <p style={{ color: "var(--muted-foreground)" }}>
          {listLoading ? (
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
              {hasMoreProducts ? " • Keep scrolling for more" : ""}
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
          {listLoading
            ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <ShopProductCardSkeleton key={i} />
              ))
            : visibleProducts.map((product) => (
                <ShopProductTile
                  key={product.id}
                  product={product}
                  user={user}
                  onRequireSignIn={handleRequireSignIn}
                />
              ))}
        </div>
      )}

      {hasMoreProducts && !showBlockingError && !listLoading && (
        <div className="flex justify-center py-8">
          <Button
            variant="outline"
            onClick={() => {
              setVisibleProductsCount((prev) =>
                Math.min(prev + PAGE_SIZE, filteredProducts.length)
              );
            }}
            className="px-8 py-3"
          >
            Show more from this search
          </Button>
        </div>
      )}

      {hasMoreProducts && !showBlockingError && !listLoading && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Scroll to load more
          </div>
        </div>
      )}

      {!hasMoreProducts && filteredProducts.length > 0 && !showBlockingError && (
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
