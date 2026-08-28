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
import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";
import ShopProductTile from "@/components/shop/ShopProductTile";
import { ShopProductCardSkeleton } from "@/components/shop/ShopProductCardSkeleton";
import { ShopEmptyState, ShopErrorState } from "@/components/shop/ShopListingStates";
import {
  SHOP_CATEGORY_SORT,
  SHOP_INITIAL_SORT,
} from "@/components/shop/shop-sort-options";
import {
  fetchShopProductsPage,
  prefetchShopProductImages,
  shopCategoryFilterIsEmpty,
  SHOP_PAGE_SIZE,
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
  categoryGroups?: ApiCategoryGroup[];
  categoriesLoading?: boolean;
  onListingMeta?: (meta: ShopListingMeta) => void;
}

const SKELETON_COUNT = 8;
const SEARCH_DEBOUNCE_MS = 300;

const ProductGrid: React.FC<ProductGridProps> = ({
  filters,
  search,
  categoryGroups = [],
  categoriesLoading = false,
  onListingMeta,
}) => {
  const sort =
    filters.categories.length > 0 ? SHOP_CATEGORY_SORT : SHOP_INITIAL_SORT;

  const [products, setProducts] = useState<ShopCatalogProduct[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(search ?? "");

  const fetchGenerationRef = useRef(0);
  const productsLengthRef = useRef(0);
  const listingAbortRef = useRef<AbortController | null>(null);
  const paginationAbortRef = useRef<AbortController | null>(null);

  const invalidateListingFetch = useCallback(() => {
    fetchGenerationRef.current += 1;
    listingAbortRef.current?.abort();
    listingAbortRef.current = null;
    paginationAbortRef.current?.abort();
    paginationAbortRef.current = null;
    setLoadingMore(false);
    return fetchGenerationRef.current;
  }, []);

  const { user } = useAuth();
  const [signInPopupVariant, setSignInPopupVariant] =
    useState<SignInPopupVariant | null>(null);

  const handleRequireSignIn = useCallback((variant: SignInPopupVariant) => {
    setSignInPopupVariant(variant);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search ?? ""),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const categoryFilterPending =
    filters.categories.length > 0 && categoriesLoading;

  const emptyCategoryFilter = useMemo(
    () => shopCategoryFilterIsEmpty(filters, categoryGroups),
    [filters, categoryGroups]
  );

  const listingQueryKey = useMemo(
    () =>
      JSON.stringify({
        filters,
        sort,
        debouncedSearch,
        categoryGroups,
      }),
    [filters, sort, debouncedSearch, categoryGroups]
  );

  useEffect(() => {
    productsLengthRef.current = products.length;
  }, [products.length]);

  const loadPage = useCallback(
    async (
      offset: number,
      options: { append: boolean; generation: number; signal?: AbortSignal }
    ) => {
      const page = await fetchShopProductsPage(
        {
          filters,
          sort,
          search: debouncedSearch,
          limit: SHOP_PAGE_SIZE,
          offset,
          categoryGroups,
        },
        options.signal
      );

      if (options.generation !== fetchGenerationRef.current) return;

      setTotalCount(page.count);
      setProducts((prev) =>
        options.append ? [...prev, ...page.results] : page.results
      );
      prefetchShopProductImages(page.results);
    },
    [filters, sort, debouncedSearch, categoryGroups]
  );

  useEffect(() => {
    if (categoryFilterPending) return;

    if (emptyCategoryFilter) {
      invalidateListingFetch();
      setProducts([]);
      setTotalCount(0);
      setListLoading(false);
      setListError(null);
      return;
    }

    const generation = invalidateListingFetch();
    const controller = new AbortController();
    listingAbortRef.current = controller;

    setListLoading(true);
    setListError(null);
    setProducts([]);
    setTotalCount(0);

    void (async () => {
      try {
        await loadPage(0, {
          append: false,
          generation,
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (generation !== fetchGenerationRef.current) return;
        console.error("Error loading shop products:", err);
        setListError("Unable to load products.");
        setProducts([]);
        setTotalCount(0);
      } finally {
        if (generation === fetchGenerationRef.current) {
          setListLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      if (listingAbortRef.current === controller) {
        listingAbortRef.current = null;
      }
    };
  }, [
    listingQueryKey,
    categoryFilterPending,
    emptyCategoryFilter,
    loadPage,
    invalidateListingFetch,
  ]);

  const hasMoreRemote = products.length < totalCount;

  const loadMore = useCallback(async () => {
    if (listLoading || loadingMore || !hasMoreRemote || emptyCategoryFilter) {
      return;
    }

    const generation = fetchGenerationRef.current;
    const offset = productsLengthRef.current;

    paginationAbortRef.current?.abort();
    const controller = new AbortController();
    paginationAbortRef.current = controller;

    setLoadingMore(true);
    try {
      await loadPage(offset, {
        append: true,
        generation,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (generation !== fetchGenerationRef.current) return;
      console.error("Error loading more products:", err);
    } finally {
      if (paginationAbortRef.current === controller) {
        paginationAbortRef.current = null;
      }
      if (generation === fetchGenerationRef.current) {
        setLoadingMore(false);
      }
    }
  }, [
    listLoading,
    loadingMore,
    hasMoreRemote,
    emptyCategoryFilter,
    loadPage,
  ]);

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.1,
    rootMargin: "400px",
    triggerOnce: false,
  });

  useEffect(() => {
    if (inView && hasMoreRemote && !listLoading && !loadingMore) {
      void loadMore();
    }
  }, [inView, hasMoreRemote, listLoading, loadingMore, loadMore]);

  const retry = useCallback(() => {
    const generation = invalidateListingFetch();

    if (emptyCategoryFilter) {
      setProducts([]);
      setTotalCount(0);
      setListLoading(false);
      setListError(null);
      return;
    }

    const controller = new AbortController();
    listingAbortRef.current = controller;

    setListLoading(true);
    setListError(null);
    setProducts([]);
    setTotalCount(0);

    void (async () => {
      try {
        await loadPage(0, {
          append: false,
          generation,
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (generation !== fetchGenerationRef.current) return;
        console.error("Error loading shop products:", err);
        setListError("Unable to load products.");
      } finally {
        if (generation === fetchGenerationRef.current) {
          setListLoading(false);
        }
      }
    })();
  }, [emptyCategoryFilter, loadPage, invalidateListingFetch]);

  const isBlockingLoad = listLoading || categoryFilterPending;
  const showBlockingError = Boolean(listError && !isBlockingLoad);
  const showEmpty = !isBlockingLoad && !showBlockingError && totalCount === 0;

  const showingFrom = products.length ? 1 : 0;
  const showingTo = products.length;

  useEffect(() => {
    onListingMeta?.({
      loading: isBlockingLoad,
      error: Boolean(listError && !isBlockingLoad),
      totalCount,
      loadedCount: products.length,
      displayedCount: products.length,
      hasMoreRemote,
    });
  }, [
    onListingMeta,
    isBlockingLoad,
    listError,
    totalCount,
    products.length,
    hasMoreRemote,
  ]);

  function handleClearFiltersViaEvent() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("clear-filters"));
    }
  }

  return (
    <section aria-label="Product catalogue">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm tabular-nums">
        <p style={{ color: "var(--muted-foreground)" }}>
          {isBlockingLoad ? (
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
              {hasMoreRemote ? " • Keep scrolling for more" : ""}
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
          {isBlockingLoad
            ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <ShopProductCardSkeleton key={i} />
              ))
            : products.map((product) => (
                <ShopProductTile
                  key={product.id}
                  product={product}
                  user={user}
                  onRequireSignIn={handleRequireSignIn}
                />
              ))}
        </div>
      )}

      {hasMoreRemote && !showBlockingError && !isBlockingLoad && (
        <div className="flex justify-center py-8">
          <Button
            variant="outline"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="px-8 py-3"
          >
            {loadingMore ? "Loading…" : "Show more from this search"}
          </Button>
        </div>
      )}

      {hasMoreRemote && !showBlockingError && !isBlockingLoad && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {loadingMore ? "Loading more products…" : "Scroll to load more"}
          </div>
        </div>
      )}

      {!hasMoreRemote && products.length > 0 && !showBlockingError && (
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
