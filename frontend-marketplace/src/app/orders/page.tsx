"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShoppingBag, Package, RefreshCw, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import OrderCard from "@/components/OrderCard";
import OrderFilters from "@/components/OrderFilters";
import OrderStats from "@/components/OrderStats";
import NotAuthenticatedState from "@/components/NotAuthenticatedState";
import PageHeader from "@/components/PageHeader";
import { useOrders } from "@/hooks/useOrders";

export default function OrdersPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    status: "",
    dateFrom: "",
    dateTo: "",
    sort: "-created_at",
  });

  const { orders, loading, error, stats, fetchOrders, reorderItems } =
    useOrders(filters);

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
    } catch (error) {
      console.error("Failed to reorder:", error);
    }
  };

  if (!user) {
    return (
      <NotAuthenticatedState
        title="Sign in to view your orders"
        description="You need to be signed in to access your order history and track deliveries."
        signInHref={getAuthUrl({ next: "/orders" })}
        showShopLink
      />
    );
  }

  return (
    <div
      className="min-h-screen py-8"
      style={{ background: "var(--background)" }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <PageHeader
          title="My Orders"
          subtitle="Track and manage your order history"
        />

        {/* Stats */}
        {stats && (
          <div className="mb-8">
            <OrderStats stats={stats} />
          </div>
        )}

        {/* Filters */}
        <div className="mb-6">
          <OrderFilters
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <div
              className="w-12 h-12 rounded-full border-2 animate-spin mx-auto mb-4"
              style={{
                borderColor: "var(--sidebar-border)",
                borderTopColor: "var(--accent)",
              }}
            />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Loading your orders…
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-16">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(220,38,38,0.1)" }}
            >
              <AlertCircle
                className="w-7 h-7"
                style={{ color: "var(--destructive)" }}
              />
            </div>
            <h2
              className="text-lg font-semibold mb-2"
              style={{ color: "var(--foreground)" }}
            >
              Something went wrong
            </h2>
            <p
              className="text-sm mb-6 max-w-xs mx-auto"
              style={{ color: "var(--muted-foreground)" }}
            >
              {error}
            </p>
            <button
              onClick={() => fetchOrders()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "var(--primary)", color: "white" }}
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && orders.length === 0 && (
          <div className="text-center py-16">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: "var(--sidebar-bg)" }}
            >
              <Package
                className="w-8 h-8"
                style={{ color: "var(--muted-foreground)" }}
              />
            </div>
            <h2
              className="text-lg font-semibold mb-2"
              style={{ color: "var(--foreground)" }}
            >
              No orders found
            </h2>
            <p
              className="text-sm mb-6 max-w-xs mx-auto"
              style={{ color: "var(--muted-foreground)" }}
            >
              {Object.values(filters).some((f) => f !== "" && f !== "-created_at")
                ? "No orders match your current filters. Try adjusting your search."
                : "You haven't placed any orders yet. Start shopping!"}
            </p>
            {!Object.values(filters).some(
              (f) => f !== "" && f !== "-created_at"
            ) && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: "var(--primary)", color: "white" }}
              >
                <ShoppingBag className="w-4 h-4" />
                Start Shopping
              </Link>
            )}
          </div>
        )}

        {/* Orders list */}
        {!loading && !error && orders.length > 0 && (
          <>
            <div className="space-y-4">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onReorder={() => handleReorder(order.id)}
                />
              ))}
            </div>

            <div className="mt-8 text-center">
              <button
                onClick={() => fetchOrders(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all hover:opacity-80"
                style={{
                  color: "var(--foreground)",
                  borderColor: "var(--sidebar-border)",
                  background: "var(--card-bg)",
                }}
              >
                Load More Orders
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
