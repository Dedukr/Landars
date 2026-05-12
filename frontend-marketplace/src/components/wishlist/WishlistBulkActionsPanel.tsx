"use client";

import { memo, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface WishlistBulkActionsPanelProps {
  selectedCount: number;
  onBulkAddToBasket: () => void;
  onBulkRemove: () => void;
}

/** Desktop/tablet bulk selection bar — existing add-to-cart + remove behaviours. */
const WishlistBulkActionsPanel = memo(function WishlistBulkActionsPanel({
  selectedCount,
  onBulkAddToBasket,
  onBulkRemove,
}: WishlistBulkActionsPanelProps) {
  const add = useCallback(() => {
    onBulkAddToBasket();
  }, [onBulkAddToBasket]);
  const remove = useCallback(() => {
    onBulkRemove();
  }, [onBulkRemove]);

  if (selectedCount === 0) return null;

  return (
    <div
      className="hidden md:flex rounded-2xl border p-4 mb-5 flex-wrap items-center justify-between gap-3"
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--accent)",
      }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
        {selectedCount} selected
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="md" onClick={add}>
          Add to basket
        </Button>
        <Button type="button" variant="destructive" size="md" icon={<Trash2 className="w-4 h-4" />} onClick={remove}>
          Remove from wishlist
        </Button>
      </div>
    </div>
  );
});

export default WishlistBulkActionsPanel;
