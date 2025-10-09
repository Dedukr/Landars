import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";
import Link from "next/link";
import SignInPopup from "./SignInPopup";
import { Button } from "@/components/ui/Button";
import { AddToCartButton } from "@/components/ui/AddToCartButton";
import { useInView } from "react-intersection-observer";

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  image_url?: string | null;
  stock_quantity?: number;
}

interface PaginatedResponse {
  results: Product[];
  count: number;
  next: string | null;
  previous: string | null;
  limit: number;
  offset: number;
  timestamp?: number; // Optional timestamp for caching
}

interface Filters {
  categories: number[];
  price: [number, number];
  inStock: boolean;
}

interface ProductGridProps {
  filters: Filters;
  sort: string;
  search?: string;
}

const skeletons = Array.from({ length: 8 });

const ProductGrid: React.FC<ProductGridProps> = ({ filters, sort, search }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Cache for API responses
  const cacheRef = useRef<Map<string, PaginatedResponse>>(new Map());
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Virtualization state - limit visible products for better performance
  const [visibleProductsCount, setVisibleProductsCount] = useState(50);

  const { cart, addToCart, removeFromCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { user } = useAuth();
  const [showSignInPopup, setShowSignInPopup] = useState(false);

  const handleWishlistClick = (productId: number) => {
    if (!user) {
      setShowSignInPopup(true);
      return;
    }

    if (isInWishlist(productId)) {
      removeFromWishlist(productId);
    } else {
      addToWishlist(productId);
    }
  };

  // Function to build query parameters with memoization
  const buildQueryParams = useMemo(
    () =>
      (offset: number = 0) => {
        const params = new URLSearchParams();
        if (filters.categories.length)
          params.append("categories", filters.categories.join(","));
        if (search) params.append("search", search);
        if (filters.inStock) params.append("in_stock", "1");
        if (sort) params.append("sort", sort);
        params.append("limit", "50");
        params.append("offset", offset.toString());
        return params.toString();
      },
    [filters, sort, search]
  );

  // Function to fetch products with caching
  const fetchProducts = useCallback(
    async (offset: number = 0, append: boolean = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = buildQueryParams(offset);
        const cacheKey = `${params}`;

        // Check cache first
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

        // Use AbortController for request cancellation and timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const res = await fetch(`/api/products/?${params}`, {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate, br",
          },
          signal: controller.signal,
          keepalive: true, // Enable keepalive for better performance
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(
            `Failed to fetch products: ${res.status} ${res.statusText}`
          );
        }

        const data: PaginatedResponse = await res.json();

        // Cache the response with timestamp
        cacheRef.current.set(cacheKey, {
          ...data,
          timestamp: Date.now(),
        });

        // Limit cache size to prevent memory issues
        if (cacheRef.current.size > 50) {
          const firstKey = cacheRef.current.keys().next().value;
          if (firstKey) {
            cacheRef.current.delete(firstKey);
          }
        }

        // Prefetch next page if we have more data and it's the first load
        if (data.next && !append) {
          const nextParams = buildQueryParams(offset + 50);
          const nextCacheKey = `${nextParams}`;
          if (!cacheRef.current.has(nextCacheKey)) {
            // Prefetch in background
            setTimeout(() => {
              fetch(`/api/products/?${nextParams}`, {
                headers: {
                  Accept: "application/json",
                },
                keepalive: true,
              })
                .then((res) => res.json())
                .then((data) => {
                  cacheRef.current.set(nextCacheKey, {
                    ...data,
                    timestamp: Date.now(),
                  });
                })
                .catch(() => {}); // Ignore prefetch errors
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
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.warn("Request was aborted");
        } else {
          console.error("Error fetching products:", error);
          setError(
            error instanceof Error ? error.message : "Failed to fetch products"
          );
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
    [buildQueryParams]
  );

  // Load more products function with debouncing
  const loadMoreProducts = useCallback(() => {
    if (!loadingMore && hasNextPage) {
      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Debounce the request to prevent excessive API calls
      debounceTimeoutRef.current = setTimeout(() => {
        const nextOffset = currentOffset + 50;
        fetchProducts(nextOffset, true);
      }, 50); // 50ms debounce for faster response
    }
  }, [loadingMore, hasNextPage, currentOffset, fetchProducts]);

  // Intersection observer for infinite scroll with optimized settings
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.1, // Trigger when 10% of the element is visible
    rootMargin: "400px", // Start loading 400px before the element comes into view for faster loading
    triggerOnce: false, // Allow multiple triggers
  });

  // Trigger load more when intersection observer detects the trigger element
  useEffect(() => {
    if (inView && hasNextPage && !loadingMore) {
      loadMoreProducts();
    }
  }, [inView, hasNextPage, loadingMore, loadMoreProducts]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Reset and fetch initial products when filters change
  useEffect(() => {
    setProducts([]);
    setCurrentOffset(0);
    setHasNextPage(true);
    setVisibleProductsCount(50); // Reset visible products count
    // Clear cache when filters change
    cacheRef.current.clear();
    fetchProducts(0, false);
  }, [filters, sort, search, fetchProducts]);

  // Memoized product component for better performance
  const ProductCard = React.memo(({ product }: { product: Product }) => (
    <div
      key={product.id}
      className="rounded-lg shadow p-4 flex flex-col hover:shadow-lg transition-shadow border animate-fade-in-up relative h-80 focus-within:ring-2 focus-within:ring-offset-2"
      style={{
        background: "var(--card-bg)",
        color: "var(--foreground)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      {/* Wishlist Heart Icon - positioned in top-right corner */}
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleWishlistClick(product.id);
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full shadow-lg hover:scale-110 transition-all duration-200"
          style={{ background: "white" }}
          aria-label={
            isInWishlist(product.id)
              ? "Remove from wishlist"
              : "Add to wishlist"
          }
        >
          <span className="text-xl leading-none block">
            {isInWishlist(product.id) ? "❤️" : "🖤"}
          </span>
        </button>
      </div>
      {/* Product Link */}
      <Link
        href={`/product/${product.id}`}
        className="flex flex-col flex-grow cursor-pointer outline-none focus:outline-none"
      >
        {/* Image section - fixed height with lazy loading */}
        <div className="h-32 w-full flex items-center justify-center bg-gray-50 rounded mb-2 overflow-hidden flex-shrink-0 relative">
          {/* Stock badge */}
          {typeof product.stock_quantity === "number" && (
            <span
              className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium"
              style={{
                background: product.stock_quantity > 0 ? "#E6F7EE" : "#FCE8E6",
                color: product.stock_quantity > 0 ? "#15803d" : "#b91c1c",
              }}
            >
              {product.stock_quantity > 0 ? "In stock" : "Out of stock"}
            </span>
          )}
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              className="object-cover h-full w-full"
              width={128}
              height={128}
              loading="lazy"
              placeholder="blur"
              blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
            />
          ) : (
            <span className="text-4xl text-gray-300">🍎</span>
          )}
        </div>

        {/* Content section - grows to fill available space */}
        <div className="flex flex-col flex-grow">
          <div
            className="font-semibold text-lg truncate mb-1"
            title={product.name}
          >
            {product.name}
          </div>
          <div
            className="text-sm truncate flex-grow"
            style={{ color: "var(--foreground)" }}
            title={product.description}
          >
            {product.description.length > 48
              ? product.description.slice(0, 48) + "..."
              : product.description}
          </div>
        </div>
      </Link>

      {/* Price and Add to Cart - always at bottom */}
      <div className="mt-auto pt-3">
        <div className="flex items-center justify-between">
          {/* Price tag */}
          <div
            className="font-bold text-lg"
            style={{ color: "var(--primary)" }}
          >
            £{product.price}
          </div>

          {/* Add to Cart Button */}
          {cart.find((item) => item.productId === product.id) ? (
            <AddToCartButton
              compact
              inCart
              quantity={
                cart.find((item) => item.productId === product.id)?.quantity ||
                0
              }
              onAdd={(e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                addToCart(product.id, 1);
              }}
              onRemove={(e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                removeFromCart(product.id);
              }}
            />
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={
                typeof product.stock_quantity === "number" &&
                product.stock_quantity <= 0
              }
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addToCart(product.id, 1);
              }}
              className="text-sm"
            >
              {typeof product.stock_quantity === "number" &&
              product.stock_quantity <= 0
                ? "Out of stock"
                : "Add to Cart"}
            </Button>
          )}
        </div>
      </div>
    </div>
  ));

  ProductCard.displayName = "ProductCard";

  // Calculate visible products for virtualization
  const visibleProducts = products.slice(0, visibleProductsCount);
  const hasMoreProducts = products.length > visibleProductsCount;

  const showingFrom = products.length ? 1 : 0;
  const showingTo = Math.min(visibleProductsCount, products.length);

  return (
    <>
      {/* Results summary */}
      <div
        className="flex items-center justify-between mb-4 text-sm"
        style={{ color: "var(--muted-foreground)" }}
      >
        {loading ? (
          <span>Loading products…</span>
        ) : error ? (
          <span style={{ color: "var(--destructive)" }}>Error: {error}</span>
        ) : totalCount === 0 ? (
          <span>No products found</span>
        ) : (
          <span>
            Showing {showingFrom}-{showingTo} of {totalCount}
            {hasNextPage && " (scroll for more)"}
          </span>
        )}
      </div>

      {/* Empty state */}
      {!loading && totalCount === 0 && (
        <div
          className="rounded border p-8 text-center"
          style={{
            borderColor: "var(--sidebar-border)",
            background: "var(--card-bg)",
          }}
        >
          <p className="mb-2 text-base" style={{ color: "var(--foreground)" }}>
            No products match your filters.
          </p>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Try adjusting categories or clearing the search.
          </p>
          <div className="mt-4">
            <button
              className="px-4 py-2 rounded text-sm font-medium"
              style={{
                background: "var(--primary)",
                color: "white",
              }}
              onClick={() => {
                if (typeof window !== "undefined") {
                  const evt = new CustomEvent("clear-filters");
                  window.dispatchEvent(evt);
                }
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
        {loading
          ? skeletons.map((_, i) => (
              <div
                key={i}
                className="bg-gray-100 rounded-lg shadow p-4 animate-pulse h-80 flex flex-col gap-2"
              >
                <div className="bg-gray-200 h-32 w-full rounded mb-2" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-4 bg-gray-200 rounded w-1/3 mt-auto" />
              </div>
            ))
          : visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
      </div>

      {/* Show More button for virtualization */}
      {hasMoreProducts && !loadingMore && (
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
            Show More
          </Button>
        </div>
      )}

      {/* Infinite scroll trigger and loading more indicator */}
      {hasNextPage && !hasMoreProducts && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore ? (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600"></div>
              Loading more products...
            </div>
          ) : (
            <div
              className="text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              Scroll down to load more products
            </div>
          )}
        </div>
      )}

      {/* End of results indicator */}
      {!hasNextPage && products.length > 0 && (
        <div className="flex justify-center py-8">
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            You&apos;ve reached the end of the results
          </div>
        </div>
      )}

      <SignInPopup
        isOpen={showSignInPopup}
        onClose={() => setShowSignInPopup(false)}
      />
    </>
  );
};

export default ProductGrid;
