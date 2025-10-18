"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
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

  // Get all categories from the API to map names to IDs
  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/categories/");
      if (response.ok) {
        const categories = await response.json();
        return categories;
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
    return [];
  }, []);

  const fetchRecommendations = useCallback(async () => {
    try {
      setIsLoading(true);

      // If no products to exclude, don't show recommendations
      if (excludeProducts.length === 0) {
        setProducts([]);
        setIsLoading(false);
        return;
      }

      // Get all categories to map names to IDs
      const allCategories = await fetchCategories();

      // Extract category names from ALL excluded products (combines all categories)
      const excludedCategoryNames = new Set<string>();
      excludeProducts.forEach((product) => {
        if (product.categories && product.categories.length > 0) {
          product.categories.forEach((cat) => {
            excludedCategoryNames.add(cat);
          });
        }
      });

      // Filter to only leaf categories (categories WITH parent - they are child categories)
      const leafCategoryNames = new Set<string>();
      excludedCategoryNames.forEach((categoryName) => {
        const category = allCategories.find(
          (cat: { id: number; name: string; parent: number | null }) =>
            cat.name === categoryName
        );
        if (category && category.parent) {
          leafCategoryNames.add(categoryName);
        }
      });

      // Map leaf category names to IDs
      const categoryIds: number[] = [];
      leafCategoryNames.forEach((categoryName) => {
        const category = allCategories.find(
          (cat: { id: number; name: string }) => cat.name === categoryName
        );
        if (category) {
          categoryIds.push(category.id);
        }
      });

      // If no valid categories found, don't show recommendations
      if (categoryIds.length === 0) {
        setProducts([]);
        setIsLoading(false);
        return;
      }

      // Build API parameters
      const params = new URLSearchParams();
      params.append("limit", (limit * 3).toString()); // Get more to ensure we have enough
      params.append("categories", categoryIds.join(","));

      // Exclude the provided products
      const excludeIds = excludeProducts.map((p) => p.id);
      params.append("exclude", excludeIds.join(","));

      const currentParams = params.toString();

      // Only fetch if parameters have changed
      if (lastFetchParams.current === currentParams) {
        setIsLoading(false);
        return;
      }

      lastFetchParams.current = currentParams;

      const response = await fetch(`/api/products/?${currentParams}`);

      if (response.ok) {
        const data = await response.json();
        const fetchedProducts = Array.isArray(data) ? data : data.results || [];

        // Filter out any products that are in the excluded list (double-check)
        const filteredProducts = fetchedProducts.filter(
          (product: Product) => !excludeIds.includes(product.id)
        );

        // Shuffle the products randomly using Fisher-Yates algorithm
        const shuffledProducts = [...filteredProducts];
        for (let i = shuffledProducts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledProducts[i], shuffledProducts[j]] = [
            shuffledProducts[j],
            shuffledProducts[i],
          ];
        }

        setProducts(shuffledProducts.slice(0, limit));
      } else {
        setProducts([]);
      }
    } catch {
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [excludeProducts, limit, fetchCategories]);

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
                  £{product.price}
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
