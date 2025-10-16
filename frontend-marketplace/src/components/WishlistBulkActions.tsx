"use client";
import React, { memo, useCallback } from "react";

interface WishlistBulkActionsProps {
  selectedCount: number;
  onBulkAddToCart: () => void;
  onBulkRemove: () => void;
}

const WishlistBulkActions = memo<WishlistBulkActionsProps>(
  ({ selectedCount, onBulkAddToCart, onBulkRemove }) => {
    const handleBulkAddToCart = useCallback(() => {
      onBulkAddToCart();
    }, [onBulkAddToCart]);

    const handleBulkRemove = useCallback(() => {
      onBulkRemove();
    }, [onBulkRemove]);

    if (selectedCount === 0) return null;

    return (
      <div
        className="rounded-lg p-4 mb-6"
        style={{
          background: "var(--sidebar-bg)",
          border: "1px solid var(--accent)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium" style={{ color: "var(--accent)" }}>
            {selectedCount} item{selectedCount > 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleBulkAddToCart}
              className="px-4 py-2 text-white rounded-md transition-colors"
              style={{ background: "var(--primary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--primary-hover)";
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
    );
  }
);

WishlistBulkActions.displayName = "WishlistBulkActions";

export default WishlistBulkActions;
