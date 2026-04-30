"use client";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import { useCart } from "@/contexts/CartContext";
import { SortOption } from "@/components/SortList";
import { toast } from "sonner";
import NotAuthenticatedState from "@/components/NotAuthenticatedState";
import PageHeader from "@/components/PageHeader";
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
  const pathname = usePathname();
  const { user } = useAuth();
  const { products, loading, stats, clearWishlist, wishlist } =
    useWishlistOptimized();
  const { filteredProducts, removingIds, removeItem } =
    useWishlistItems(products);
  const { addToCart } = useCart();
  // sonner is used for toast notifications
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
    const count = selectedItems.size;
    setSelectedItems(new Set());
    toast.success(`Added ${count} item${count !== 1 ? "s" : ""} to cart`);
  }, [selectedItems, addToCart]);

  const handleBulkRemove = useCallback(() => {
    selectedItems.forEach((productId) => {
      removeItem(productId);
    });
    const count = selectedItems.size;
    setSelectedItems(new Set());
    toast.success(`Removed ${count} item${count !== 1 ? "s" : ""} from wishlist`);
  }, [selectedItems, removeItem]);

  const handleItemAddToCart = useCallback((productName: string) => {
    toast.success(`${productName} added to cart`);
  }, []);


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
      <NotAuthenticatedState
        title="Sign in to view your wishlist"
        description="Save your favourite products and access them any time."
        signInHref={getAuthUrl({ next: pathname })}
        showShopLink
      />
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
    <div className="min-h-screen py-8" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <PageHeader
          title="My Wishlist"
          subtitle="Save your favourite products for later"
        />

        {wishlist.length === 0 ? (
          <div className="text-center py-16">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: "var(--sidebar-bg)" }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: "var(--muted-foreground)" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </div>
            <h2
              className="text-lg font-semibold mb-2"
              style={{ color: "var(--foreground)" }}
            >
              Your wishlist is empty
            </h2>
            <p
              className="text-sm mb-6 max-w-xs mx-auto"
              style={{ color: "var(--muted-foreground)" }}
            >
              Start saving products you love to your wishlist.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "var(--primary)", color: "white" }}
            >
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
                      onClick={clearWishlist}
                      className="text-sm font-medium transition-opacity hover:opacity-70"
                      style={{ color: "var(--destructive)" }}
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
                onAddToCart={handleItemAddToCart}
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

            <div className="mt-8 text-center">
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all hover:opacity-80"
                style={{
                  borderColor: "var(--sidebar-border)",
                  color: "var(--foreground)",
                  background: "var(--card-bg)",
                }}
              >
                Continue Shopping
              </Link>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
