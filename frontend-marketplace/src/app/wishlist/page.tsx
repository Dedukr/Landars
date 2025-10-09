"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCart } from "@/contexts/CartContext";
import SortList, { SortOption } from "@/components/SortList";
import { httpClient } from "@/utils/httpClient";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  categories?: string[];
  image_url?: string | null;
  original_price?: string;
  discount_percentage?: number;
  in_stock?: boolean;
  stock_quantity?: number;
}

interface WishlistStats {
  totalItems: number;
  totalValue: number;
  averagePrice: number;
  categories: string[];
}

export default function WishlistPage() {
  const { wishlist, removeFromWishlist, clearWishlist } = useWishlist();
  const { addToCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [stats, setStats] = useState<WishlistStats | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "name" | "name_desc" | "price" | "price_desc"
  >("name");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const wishlistSortOptions: SortOption[] = [
    { value: "name", label: "Name: A-Z", icon: "↑" },
    { value: "name_desc", label: "Name: Z-A", icon: "↓" },
    { value: "price", label: "Price: Low to High", icon: "↑" },
    { value: "price_desc", label: "Price: High to Low", icon: "↓" },
  ];

  const categoryFilterOptions: SortOption[] = [
    { value: "all", label: "All Categories", icon: "📂" },
    ...(stats?.categories?.map((category) => ({
      value: category,
      label: category,
      icon: "🏷️",
    })) || []),
  ];

  const fetchRecommendations = React.useCallback(
    async (wishlistProducts: Product[]) => {
      try {
        // Get categories from wishlist items
        const categories = [
          ...new Set(wishlistProducts.flatMap((p) => p.categories || [])),
        ];

        if (categories.length > 0) {
          // Build query parameters with exclude and categories
          const params = new URLSearchParams();
          params.append("categories", categories.join(","));
          params.append("exclude", wishlist.join(","));
          params.append("limit", "6");

          const allProducts = await httpClient.getProducts<Product>(
            `/api/products/?${params.toString()}`
          );

          setRecommendations(allProducts.slice(0, 6));
        }
      } catch (error) {
        console.error("Error fetching recommendations:", error);
      }
    },
    [wishlist]
  );

  useEffect(() => {
    async function fetchProducts() {
      if (wishlist.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Fetch all products using httpClient
        const allProducts = await httpClient.getProducts<Product>(
          "/api/products/"
        );

        // Filter to only products in wishlist
        const wishlistProducts = allProducts.filter((p: Product) =>
          wishlist.includes(p.id)
        );
        setProducts(wishlistProducts);

        // Calculate stats
        calculateStats(wishlistProducts);

        // Fetch recommendations
        fetchRecommendations(wishlistProducts);
      } catch (error) {
        console.error("Error fetching products:", error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, [wishlist, fetchRecommendations]);

  const calculateStats = (products: Product[]) => {
    const totalValue = products.reduce(
      (sum, product) => sum + parseFloat(product.price),
      0
    );
    const categories = [
      ...new Set(products.flatMap((p) => p.categories || [])),
    ];

    setStats({
      totalItems: products.length,
      totalValue,
      averagePrice: products.length > 0 ? totalValue / products.length : 0,
      categories,
    });
  };

  const handleAddToCart = (productId: number) => {
    addToCart(productId, 1);

    // Show toast notification
    setToastMessage("Added to your cart");
    setShowToast(true);

    // Hide toast after 3 seconds
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  const handleRemoveFromWishlist = (productId: number) => {
    // Add to removing set to trigger fade-out animation
    setRemovingIds((prev) => new Set(prev).add(productId));

    // Wait for animation to complete before actually removing
    setTimeout(() => {
      removeFromWishlist(productId);
      setRemovingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }, 300); // Match the animation duration
  };

  const handleBulkAddToCart = () => {
    selectedItems.forEach((productId) => {
      addToCart(productId, 1);
    });
    setSelectedItems(new Set());
    setToastMessage(`Added ${selectedItems.size} items to cart`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleBulkRemove = () => {
    selectedItems.forEach((productId) => {
      removeFromWishlist(productId);
    });
    setSelectedItems(new Set());
    setToastMessage(`Removed ${selectedItems.size} items from wishlist`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === products.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(products.map((p) => p.id)));
    }
  };

  const handleShareWishlist = () => {
    const wishlistUrl = `${window.location.origin}/wishlist?shared=true`;
    navigator.clipboard.writeText(wishlistUrl);
    setToastMessage("Wishlist link copied to clipboard!");
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const filteredAndSortedProducts = (Array.isArray(products) ? products : [])
    .filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase());
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
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
            {stats && (
              <div
                className="rounded-lg shadow-sm p-6 mb-6"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--sidebar-border)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div
                      className="text-2xl font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {stats.totalItems}
                    </div>
                    <div
                      className="text-sm"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Items
                    </div>
                  </div>
                  <div className="text-center">
                    <div
                      className="text-2xl font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      £{stats.totalValue.toFixed(2)}
                    </div>
                    <div
                      className="text-sm"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Total Value
                    </div>
                  </div>
                  <div className="text-center">
                    <div
                      className="text-2xl font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      £{stats.averagePrice.toFixed(2)}
                    </div>
                    <div
                      className="text-sm"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Avg. Price
                    </div>
                  </div>
                  <div className="text-center">
                    <div
                      className="text-2xl font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {stats.categories.length}
                    </div>
                    <div
                      className="text-sm"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Categories
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Search and Filter Controls */}
            <div
              className="rounded-lg shadow-sm p-6 mb-6"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search your wishlist..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-full focus:outline-none"
                    style={{
                      background: "var(--sidebar-bg)",
                      color: "var(--foreground)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <SortList
                    options={categoryFilterOptions}
                    value={filterCategory}
                    onChange={setFilterCategory}
                    placeholder="Filter by category..."
                    className="min-w-[180px]"
                  />
                  <SortList
                    options={wishlistSortOptions}
                    value={sortBy}
                    onChange={(value) =>
                      setSortBy(
                        value as "name" | "name_desc" | "price" | "price_desc"
                      )
                    }
                    placeholder="Choose sorting..."
                    className="min-w-[200px]"
                  />
                </div>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedItems.size > 0 && (
              <div
                className="rounded-lg p-4 mb-6"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--accent)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-medium"
                    style={{ color: "var(--accent)" }}
                  >
                    {selectedItems.size} item{selectedItems.size > 1 ? "s" : ""}{" "}
                    selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleBulkAddToCart}
                      className="px-4 py-2 text-white rounded-md transition-colors"
                      style={{ background: "var(--primary)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "var(--primary-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--primary)";
                      }}
                    >
                      Add to Cart
                    </button>
                    <button
                      onClick={handleBulkRemove}
                      className="px-4 py-2 text-white rounded-md transition-colors"
                      style={{ background: "#dc2626" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#b91c1c";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#dc2626";
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                  <h2
                    className="text-lg font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    Wishlist Items ({filteredAndSortedProducts.length})
                  </h2>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleSelectAll}
                      className="text-sm transition-colors"
                      style={{ color: "var(--accent)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      {selectedItems.size === products.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                    <button
                      onClick={handleShareWishlist}
                      className="text-sm transition-colors"
                      style={{ color: "var(--accent)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Share Wishlist
                    </button>
                    <button
                      onClick={clearWishlist}
                      className="text-sm transition-colors"
                      style={{ color: "#dc2626" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid var(--sidebar-border)" }}>
                {filteredAndSortedProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`p-6 transition-all duration-300 ${
                      removingIds.has(product.id)
                        ? "opacity-0 transform -translate-x-4 max-h-0 overflow-hidden"
                        : "opacity-100 transform translate-x-0"
                    }`}
                    style={{ borderBottom: "1px solid var(--sidebar-border)" }}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(product.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedItems);
                            if (e.target.checked) {
                              newSelected.add(product.id);
                            } else {
                              newSelected.delete(product.id);
                            }
                            setSelectedItems(newSelected);
                          }}
                          className="h-4 w-4 rounded"
                          style={{ accentColor: "var(--primary)" }}
                        />
                      </div>
                      <div className="flex-shrink-0">
                        {product.image_url ? (
                          <Image
                            src={product.image_url}
                            alt={product.name}
                            width={80}
                            height={80}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                        ) : (
                          <div
                            className="w-20 h-20 rounded-lg flex items-center justify-center"
                            style={{ background: "var(--sidebar-bg)" }}
                          >
                            <span className="text-2xl">🍎</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className="text-lg font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          {product.name}
                        </h3>
                        {product.description && (
                          <p
                            className="text-sm mt-1 line-clamp-2"
                            style={{ color: "var(--foreground)", opacity: 0.7 }}
                          >
                            {product.description}
                          </p>
                        )}
                        {product.categories &&
                          product.categories.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {product.categories.map((category, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                                  style={{
                                    background: "var(--sidebar-bg)",
                                    color: "var(--foreground)",
                                  }}
                                >
                                  {category}
                                </span>
                              ))}
                            </div>
                          )}
                        <div className="mt-2 flex items-center space-x-4">
                          <div
                            className="text-lg font-semibold"
                            style={{ color: "var(--foreground)" }}
                          >
                            £{parseFloat(product.price).toFixed(2)}
                          </div>
                          {product.original_price &&
                            parseFloat(product.original_price) >
                              parseFloat(product.price) && (
                              <div
                                className="text-sm line-through"
                                style={{
                                  color: "var(--foreground)",
                                  opacity: 0.5,
                                }}
                              >
                                £{parseFloat(product.original_price).toFixed(2)}
                              </div>
                            )}
                          {product.discount_percentage && (
                            <span
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                              style={{
                                background: "var(--accent)",
                                color: "#fff",
                              }}
                            >
                              -{product.discount_percentage}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        <button
                          onClick={() => handleRemoveFromWishlist(product.id)}
                          className="transition-colors"
                          style={{ color: "#dc2626" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "0.8";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "1";
                          }}
                          title="Remove from wishlist"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleAddToCart(product.id)}
                          className="px-4 py-2 text-white rounded-md transition-colors text-sm font-medium"
                          style={{ background: "var(--primary)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "var(--primary-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "var(--primary)";
                          }}
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div
                className="mt-8 rounded-lg shadow-sm overflow-hidden"
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
                  <h2
                    className="text-lg font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    You might also like
                  </h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {recommendations.map((product) => (
                      <div key={product.id} className="text-center">
                        <div className="aspect-square mb-2">
                          {product.image_url ? (
                            <Image
                              src={product.image_url}
                              alt={product.name}
                              width={120}
                              height={120}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <div
                              className="w-full h-full rounded-lg flex items-center justify-center"
                              style={{ background: "var(--sidebar-bg)" }}
                            >
                              <span className="text-2xl">🍎</span>
                            </div>
                          )}
                        </div>
                        <h3
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--foreground)" }}
                        >
                          {product.name}
                        </h3>
                        <p
                          className="text-sm"
                          style={{ color: "var(--foreground)", opacity: 0.7 }}
                        >
                          £{product.price}
                        </p>
                        <button
                          onClick={() => handleAddToCart(product.id)}
                          className="mt-2 w-full px-3 py-1 text-xs font-medium rounded transition-colors"
                          style={{
                            color: "var(--accent)",
                            border: "1px solid var(--accent)",
                            background: "transparent",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--accent)";
                            e.currentTarget.style.color = "#fff";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "var(--accent)";
                          }}
                        >
                          Add to Cart
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

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
