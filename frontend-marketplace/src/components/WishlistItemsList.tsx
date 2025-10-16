"use client";
import React, { memo, useCallback } from "react";
import WishlistItem from "./WishlistItem";

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

interface WishlistItemsListProps {
  products: Product[];
  removingIds: Set<number>;
  selectedItems: Set<number>;
  onRemove: (productId: number) => void;
  onSelect: (productId: number, selected: boolean) => void;
}

const WishlistItemsList = memo<WishlistItemsListProps>(
  ({ products, removingIds, selectedItems, onRemove, onSelect }) => {
    const handleSelect = useCallback(
      (productId: number, selected: boolean) => {
        onSelect(productId, selected);
      },
      [onSelect]
    );

    return (
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
          <h2
            className="text-lg font-medium"
            style={{ color: "var(--foreground)" }}
          >
            Wishlist Items ({products.length})
          </h2>
        </div>
        <div style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          {products.map((product) => (
            <WishlistItem
              key={product.id}
              product={product}
              isRemoving={removingIds.has(product.id)}
              isSelected={selectedItems.has(product.id)}
              onRemove={onRemove}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    );
  }
);

WishlistItemsList.displayName = "WishlistItemsList";

export default WishlistItemsList;
