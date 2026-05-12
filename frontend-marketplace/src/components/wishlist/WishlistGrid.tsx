"use client";

import { memo } from "react";
import { WishlistItemCard } from "./WishlistItemCard";
import type { WishlistProduct } from "@/lib/wishlistTypes";

interface WishlistGridProps {
  products: WishlistProduct[];
  removingIds: Set<number>;
  selectedItems: Set<number>;
  onRemove: (productId: number) => void;
  onSelect: (productId: number, selected: boolean) => void;
  onAddedToBasket?: (productName: string) => void;
}

const WishlistGrid = memo(function WishlistGrid({
  products,
  removingIds,
  selectedItems,
  onRemove,
  onSelect,
  onAddedToBasket,
}: WishlistGridProps) {
  return (
    <section aria-label={`Saved items, ${products.length} products`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
        {products.map((product) => (
          <WishlistItemCard
            key={product.id}
            product={product}
            isRemoving={removingIds.has(product.id)}
            isSelected={selectedItems.has(product.id)}
            onRemove={onRemove}
            onSelect={onSelect}
            onAddedToBasket={onAddedToBasket}
          />
        ))}
      </div>
    </section>
  );
});

export default WishlistGrid;
