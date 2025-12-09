"use client";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/contexts/AuthContext";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  image_url?: string | null;
  categories?: string[];
  stock_quantity?: number;
  in_stock?: boolean;
}

interface ProductRecommendationsProps {
  // Core data
  excludeProducts: Product[];
  limit?: number;

  // Display configuration
  title?: string;
  showWishlist?: boolean;
  showQuickAdd?: boolean;

  // Styling
  className?: string;
  gridCols?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
}

const ProductRecommendations: React.FC<ProductRecommendationsProps> = ({
  excludeProducts = [],
  limit = 4,
  title = "You might also like",
  showWishlist = false,
  showQuickAdd = true,
  className = "",
  gridCols = { default: 2, md: 4 },
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { user } = useAuth();
  const lastFetchParams = useRef<string>("");
  const hasFetchedRef = useRef<boolean>(false);
  const initialExcludeIdsRef = useRef<string>("");

  // Create stable exclude IDs string for initial fetch only
  const excludeIdsString = useMemo(() => {
    const ids = excludeProducts.map((p) => p.id).sort((a, b) => a - b);
    return ids.join(",");
  }, [excludeProducts]);

  // Store initial exclude IDs on first render
  useEffect(() => {
    if (!hasFetchedRef.current && excludeIdsString) {
      initialExcludeIdsRef.current = excludeIdsString;
    }
  }, [excludeIdsString]);

  const fetchRecommendations = useCallback(async () => {
    try {
      // Only fetch once on initial mount, not when excludeProducts changes
      if (hasFetchedRef.current && products.length > 0) {
        return; // Don't refetch after initial load
      }

      setIsLoading(true);

      // Use initial exclude IDs (from first render) to prevent refetching when items are removed
      const excludeIdsToUse = initialExcludeIdsRef.current
        ? initialExcludeIdsRef.current.split(",").map(Number)
        : excludeProducts.map((p) => p.id);
      
      // Fetch ALL products (or a very large number) without category filtering
      // This ensures we get products from the entire scope
      const params = new URLSearchParams();
      // Fetch a large number to ensure good randomization from all products
      // Use a high limit to get as many products as possible
      params.append("limit", "500"); // Fetch up to 500 products
      
      // Exclude the provided products (using initial exclude list)
      if (excludeIdsToUse.length > 0) {
        params.append("exclude", excludeIdsToUse.join(","));
      }

      const currentParams = params.toString();

      // Only fetch if parameters have changed
      if (lastFetchParams.current === currentParams && products.length > 0) {
        setIsLoading(false);
        return;
      }

      lastFetchParams.current = currentParams;

      // Fetch all products (or paginate if needed)
      let allProducts: Product[] = [];
      let offset = 0;
      const pageSize = 500;
      let hasMore = true;

      // Fetch products in batches until we have enough or no more products
      while (hasMore && allProducts.length < 1000) {
        const batchParams = new URLSearchParams();
        batchParams.append("limit", pageSize.toString());
        batchParams.append("offset", offset.toString());
        if (excludeIdsToUse.length > 0) {
          batchParams.append("exclude", excludeIdsToUse.join(","));
        }

        const response = await fetch(`/api/products/?${batchParams.toString()}`);
        
        if (response.ok) {
          const data = await response.json();
          const batchProducts = Array.isArray(data) ? data : data.results || [];
          
          if (batchProducts.length === 0) {
            hasMore = false;
          } else {
            allProducts = [...allProducts, ...batchProducts];
            offset += pageSize;
            
            // If we got fewer products than requested, we've reached the end
            if (batchProducts.length < pageSize) {
              hasMore = false;
            }
          }
        } else {
          hasMore = false;
        }
      }

      // Filter out any products that are in the excluded list (double-check)
      const filteredProducts = allProducts.filter(
        (product: Product) => !excludeIdsToUse.includes(product.id)
      );

      // Enhanced shuffle: Fisher-Yates algorithm with multiple passes for better randomization
      const shuffledProducts = [...filteredProducts];
      
      // Perform multiple shuffle passes for better randomization
      for (let pass = 0; pass < 5; pass++) {
        for (let i = shuffledProducts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledProducts[i], shuffledProducts[j]] = [
            shuffledProducts[j],
            shuffledProducts[i],
          ];
        }
      }

      // Randomly select products from the shuffled array
      // Instead of taking a consecutive slice, randomly pick individual products
      const selectedProducts: Product[] = [];
      const availableIndices = shuffledProducts.map((_, index) => index);
      
      // Randomly select up to 'limit' products
      const selectionCount = Math.min(limit, shuffledProducts.length);
      for (let i = 0; i < selectionCount; i++) {
        const randomIndex = Math.floor(Math.random() * availableIndices.length);
        const productIndex = availableIndices.splice(randomIndex, 1)[0];
        selectedProducts.push(shuffledProducts[productIndex]);
      }

      setProducts(selectedProducts);
      hasFetchedRef.current = true; // Mark as fetched
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [limit, excludeProducts, products.length]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const handleAddToCart = useCallback(
    (productId: number) => {
      addToCart(productId, 1);
    },
    [addToCart]
  );

  const handleWishlistClick = useCallback(
    (productId: number) => {
      if (!user) return;

      if (isInWishlist(productId)) {
        removeFromWishlist(productId);
      } else {
        addToWishlist(productId);
      }
    },
    [user, isInWishlist, addToWishlist, removeFromWishlist]
  );

  if (isLoading) {
    return (
      <div className={className}>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div
          className={`grid gap-4 ${
            gridCols.default ? `grid-cols-${gridCols.default}` : "grid-cols-2"
          } ${gridCols.sm ? `sm:grid-cols-${gridCols.sm}` : "sm:grid-cols-2"} ${
            gridCols.md ? `md:grid-cols-${gridCols.md}` : "md:grid-cols-4"
          } ${gridCols.lg ? `lg:grid-cols-${gridCols.lg}` : ""}`}
        >
          {Array.from({ length: limit }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="bg-gray-200 aspect-square rounded-lg mb-2"></div>
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--foreground)" }}
      >
        {title}
      </h3>
      <div
        className={`grid gap-4 ${
          gridCols.default ? `grid-cols-${gridCols.default}` : "grid-cols-2"
        } ${gridCols.sm ? `sm:grid-cols-${gridCols.sm}` : "sm:grid-cols-2"} ${
          gridCols.md ? `md:grid-cols-${gridCols.md}` : "md:grid-cols-4"
        } ${gridCols.lg ? `lg:grid-cols-${gridCols.lg}` : ""}`}
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="group relative flex flex-col h-full rounded-lg border hover:shadow-lg transition-shadow"
            style={{
              background: "var(--card-bg)",
              color: "var(--foreground)",
              borderColor: "var(--sidebar-border)",
            }}
          >
            <Link
              href={`/product/${product.id}`}
              className="flex flex-col h-full p-3"
            >
              <div
                className="aspect-square relative overflow-hidden rounded-lg flex-shrink-0"
                style={{ background: "var(--sidebar-bg)" }}
              >
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: "var(--sidebar-bg)" }}
                  >
                    <span
                      className="text-4xl"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      🍎
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2 flex-grow flex flex-col">
                <h4
                  className="text-sm font-medium line-clamp-2 flex-grow"
                  style={{ color: "var(--foreground)" }}
                >
                  {product.name}
                </h4>
                <p
                  className="text-lg font-bold mt-1"
                  style={{ color: "var(--primary)" }}
                >
                  £{product.price ? parseFloat(String(product.price)).toFixed(2) : "0.00"}
                </p>
              </div>
            </Link>

            {/* Action buttons */}
            <div className="mt-2 flex gap-2 flex-shrink-0">
              {showQuickAdd && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleAddToCart(product.id);
                  }}
                  className="flex-1 bg-green-600 text-white text-xs py-2 px-3 rounded hover:bg-green-700 transition-colors"
                >
                  Add to Cart
                </button>
              )}

              {showWishlist && user && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleWishlistClick(product.id);
                  }}
                  className={`p-2 rounded transition-colors ${
                    isInWishlist(product.id)
                      ? "text-red-500 hover:text-red-600"
                      : "text-gray-400 hover:text-red-500"
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(ProductRecommendations);
