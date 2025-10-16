"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import OrderCard from "@/components/OrderCard";
import OrderFilters from "@/components/OrderFilters";
import OrderStats from "@/components/OrderStats";
import { useOrders } from "@/hooks/useOrders";

export default function OrdersPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    status: "",
    dateFrom: "",
    dateTo: "",
    sort: "-order_date",
  });

  const {
    orders,
    loading,
    error,
    stats,
    fetchOrders,
    cancelOrder,
    reorderItems,
  } = useOrders(filters);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user, filters, fetchOrders]);

  const handleFilterChange = (newFilters: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleReorder = async (orderId: number) => {
    try {
      await reorderItems(orderId);
      // Show success message or redirect to cart
    } catch (error) {
      console.error("Failed to reorder:", error);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      await cancelOrder(orderId);
      fetchOrders(); // Refresh orders
    } catch (error) {
      console.error("Failed to cancel order:", error);
    }
  };

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
              Please sign in to view your orders
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              You need to be signed in to access your order history and manage
              your orders.
            </p>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Sign In
            </Link>
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
            My Orders
          </h1>
          <p
            className="mt-2"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            Track and manage your order history
          </p>
        </div>

        {/* Order Stats */}
        {stats && (
          <div className="mb-8">
            <OrderStats stats={stats} />
          </div>
        )}

        {/* Filters */}
        <div className="mb-8">
          <OrderFilters filters={filters} onFilterChange={handleFilterChange} />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-16">
            <div className="mb-6 text-4xl">⏳</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Loading your orders...
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Please wait while we fetch your order history.
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-16">
            <div className="mb-6 text-8xl">❌</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Something went wrong
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              {error}
            </p>
            <button
              onClick={() => fetchOrders()}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && orders.length === 0 && (
          <div className="text-center py-16">
            <div className="mb-6 text-8xl">📦</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              No orders found
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              {Object.values(filters).some((f) => f !== "")
                ? "No orders match your current filters. Try adjusting your search criteria."
                : "You haven't placed any orders yet. Start shopping to see your orders here!"}
            </p>
            {!Object.values(filters).some((f) => f !== "") && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                <svg
                  className="w-5 h-5"
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
            )}
          </div>
        )}

        {/* Orders List */}
        {!loading && !error && orders.length > 0 && (
          <div className="space-y-6">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onReorder={() => handleReorder(order.id)}
                onCancel={() => handleCancelOrder(order.id)}
              />
            ))}
          </div>
        )}

        {/* Load More Button */}
        {!loading && !error && orders.length > 0 && (
          <div className="mt-8 text-center">
            <button
              onClick={() => fetchOrders(true)}
              className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              style={{
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              Load More Orders
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
