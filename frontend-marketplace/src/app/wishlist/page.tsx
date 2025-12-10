"use client";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { SortOption } from "@/components/SortList";
import WishlistStats from "@/components/WishlistStats";
import WishlistSearchAndFilter from "@/components/WishlistSearchAndFilter";
import WishlistBulkActions from "@/components/WishlistBulkActions";
import WishlistItemsList from "@/components/WishlistItemsList";
import ProductRecommendations from "@/components/ProductRecommendations";
import { useWishlistOptimized } from "@/hooks/useWishlistOptimized";
import { useWishlistItems } from "@/hooks/useWishlistItems";

interface Category {
  id: number;
  name: string;
  parent: number | null;
}

export default function WishlistPage() {
  const { user } = useAuth();
  const { products, loading, stats, clearWishlist, wishlist } =
    useWishlistOptimized();
  const { filteredProducts, removingIds, removeItem } =
    useWishlistItems(products);
  const { addToCart } = useCart();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "name" | "name_desc" | "price" | "price_desc"
  >("name");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [categories, setCategories] = useState<Category[]>([]);

  // Fetch categories to identify leaf categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch("/api/categories/");
        if (response.ok) {
          const data = await response.json();
          setCategories(data);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };
    fetchCategories();
  }, []);

  // Filter products to only show leaf categories and map category names
  const productsWithLeafCategories = useMemo(() => {
    if (!categories.length) return filteredProducts;

    // Create a map of category names to their parent status
    const categoryMap = new Map<string, boolean>();
    categories.forEach((cat) => {
      categoryMap.set(cat.name, cat.parent !== null);
    });

    return filteredProducts.map((product) => {
      // Filter to only leaf categories (categories with a parent)
      const leafCategories =
        product.categories?.filter((catName) => categoryMap.get(catName)) || [];

      return {
        ...product,
        categories: leafCategories,
      };
    });
  }, [filteredProducts, categories]);

  const wishlistSortOptions: SortOption[] = [
    { value: "name", label: "Name: A-Z", icon: "↑" },
    { value: "name_desc", label: "Name: Z-A", icon: "↓" },
    { value: "price", label: "Price: Low to High", icon: "↑" },
    { value: "price_desc", label: "Price: High to Low", icon: "↓" },
  ];

  // Get leaf categories from products for filter options
  const leafCategoriesForFilter = useMemo(() => {
    const leafCategorySet = new Set<string>();
    productsWithLeafCategories.forEach((product) => {
      product.categories?.forEach((cat) => leafCategorySet.add(cat));
    });
    return Array.from(leafCategorySet).sort();
  }, [productsWithLeafCategories]);

  const categoryFilterOptions: SortOption[] = [
    { value: "all", label: "All Categories", icon: "📂" },
    ...leafCategoriesForFilter.map((category) => ({
      value: category,
      label: category,
      icon: "🏷️",
    })),
  ];

  const handleBulkAddToCart = useCallback(() => {
    selectedItems.forEach((productId) => {
      addToCart(productId, 1);
    });
    setSelectedItems(new Set());
    setToastMessage(`Added ${selectedItems.size} items to cart`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }, [selectedItems, addToCart]);

  const handleBulkRemove = useCallback(() => {
    selectedItems.forEach((productId) => {
      removeItem(productId);
    });
    setSelectedItems(new Set());
    setToastMessage(`Removed ${selectedItems.size} items from wishlist`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }, [selectedItems, removeItem]);

  const handleSelectAll = useCallback(() => {
    if (selectedItems.size === products.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(products.map((p) => p.id)));
    }
  }, [selectedItems.size, products]);

  const handleSelect = useCallback((productId: number, selected: boolean) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(productId);
      } else {
        newSet.delete(productId);
      }
      return newSet;
    });
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSortChange = useCallback((sortBy: string) => {
    setSortBy(sortBy as "name" | "name_desc" | "price" | "price_desc");
  }, []);

  const handleFilterChange = useCallback((category: string) => {
    setFilterCategory(category);
  }, []);

  const handleShareWishlist = useCallback(() => {
    const wishlistUrl = `${window.location.origin}/wishlist?shared=true`;
    navigator.clipboard.writeText(wishlistUrl);
    setToastMessage("Wishlist link copied to clipboard!");
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }, []);

  const filteredAndSortedProducts = useMemo(() => {
    return (
      Array.isArray(productsWithLeafCategories)
        ? productsWithLeafCategories
        : []
    )
      .filter((product) => {
        // Ensure name and description are strings before calling toLowerCase
        const productName =
          typeof product.name === "string" ? product.name : "";
        const productDescription =
          typeof product.description === "string" ? product.description : "";
        const searchLower =
          typeof searchQuery === "string" ? searchQuery.toLowerCase() : "";

        const matchesSearch =
          productName.toLowerCase().includes(searchLower) ||
          (productDescription &&
            productDescription.toLowerCase().includes(searchLower));
        const matchesCategory =
          filterCategory === "all" ||
          product.categories?.includes(filterCategory);
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.name.localeCompare(b.name);
          case "name_desc":
            return b.name.localeCompare(a.name);
          case "price":
            return parseFloat(a.price) - parseFloat(b.price);
          case "price_desc":
            return parseFloat(b.price) - parseFloat(a.price);
          default:
            return 0; // Keep original order
        }
      });
  }, [productsWithLeafCategories, searchQuery, filterCategory, sortBy]);

  if (!user) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <div className="mb-6 text-8xl">🔐</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Please sign in to view your wishlist
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              You need to be signed in to access your wishlist and save your
              favorite products.
            </p>
            <Link
              href="/auth"
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
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div
              className="h-8 rounded w-1/4 mb-4"
              style={{ background: "var(--sidebar-bg)" }}
            ></div>
            <div
              className="h-4 rounded w-1/2 mb-8"
              style={{ background: "var(--sidebar-bg)" }}
            ></div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded"
                  style={{ background: "var(--sidebar-bg)" }}
                ></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
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
            My Wishlist
          </h1>
          <p
            className="mt-2"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            Save your favorite products for later
          </p>
        </div>

        {wishlist.length === 0 ? (
          <div className="text-center py-16">
            <div className="mb-6 text-8xl">💝</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Your wishlist is empty
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Start adding products you love to your wishlist! Discover amazing
              items and save them for later.
            </p>
            <Link
              href="/"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white transition-colors"
              style={{
                background: "var(--primary)",
                color: "#fff",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--primary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--primary)";
              }}
            >
              <svg
                className="w-5 h-5 mr-2"
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
            {/* Stats and Actions */}
            <WishlistStats stats={stats} />

            {/* Search and Filter Controls */}
            <WishlistSearchAndFilter
              searchQuery={searchQuery}
              sortBy={sortBy}
              filterCategory={filterCategory}
              categoryFilterOptions={categoryFilterOptions}
              wishlistSortOptions={wishlistSortOptions}
              onSearchChange={handleSearchChange}
              onSortChange={handleSortChange}
              onFilterChange={handleFilterChange}
            />

            {/* Bulk Actions */}
            <WishlistBulkActions
              selectedCount={selectedItems.size}
              onBulkAddToCart={handleBulkAddToCart}
              onBulkRemove={handleBulkRemove}
            />

            {/* Wishlist Items */}
            <div
              className="rounded-lg shadow-sm overflow-hidden"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <div
                className="px-6 py-4"
                style={{ borderBottom: "1px solid var(--sidebar-border)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleSelectAll}
                      className="text-sm transition-colors touch-manipulation"
                      style={{
                        color: "var(--accent)",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      onTouchStart={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onTouchEnd={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      {selectedItems.size === products.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                    <button
                      onClick={handleShareWishlist}
                      className="text-sm transition-colors touch-manipulation"
                      style={{
                        color: "var(--accent)",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      onTouchStart={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onTouchEnd={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Share Wishlist
                    </button>
                    <button
                      onClick={clearWishlist}
                      className="text-sm transition-colors touch-manipulation"
                      style={{
                        color: "#dc2626",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      onTouchStart={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onTouchEnd={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
              <WishlistItemsList
                products={filteredAndSortedProducts}
                removingIds={removingIds}
                selectedItems={selectedItems}
                onRemove={removeItem}
                onSelect={handleSelect}
              />
            </div>

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

            {/* Continue Shopping */}
            <div className="mt-8 text-center">
              <Link
                href="/"
                className="inline-flex items-center px-6 py-3 text-base font-medium rounded-md transition-colors"
                style={{
                  border: "1px solid var(--sidebar-border)",
                  color: "var(--foreground)",
                  background: "var(--card-bg)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--sidebar-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--card-bg)";
                }}
              >
                <svg
                  className="w-5 h-5 mr-2"
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
                Continue Shopping
              </Link>
            </div>
          </>
        )}

        {/* Toast Notification */}
        {showToast && (
          <div
            className="fixed bottom-6 right-6 px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-50 animate-slide-up"
            style={{
              background: "var(--accent)",
              color: "#fff",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <span className="text-2xl">✓</span>
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
