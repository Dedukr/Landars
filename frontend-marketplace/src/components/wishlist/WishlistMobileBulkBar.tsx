"use client";

import { memo, useCallback } from "react";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface WishlistMobileBulkBarProps {
  selectedCount: number;
  onBulkAddToBasket: () => void;
  onBulkRemove: () => void;
}

/** Sticky bulk bar for small screens when selection exists. */
const WishlistMobileBulkBar = memo(function WishlistMobileBulkBar({
  selectedCount,
  onBulkAddToBasket,
  onBulkRemove,
}: WishlistMobileBulkBarProps) {
  const add = useCallback(() => onBulkAddToBasket(), [onBulkAddToBasket]);
  const remove = useCallback(() => onBulkRemove(), [onBulkRemove]);

  if (selectedCount === 0) return null;

  return (
    <div
      className="md:hidden fixed inset-x-0 bottom-0 z-40 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.12)",
      }}
    >
      <p className="text-xs font-semibold mb-2 text-center" style={{ color: "var(--foreground)" }}>
        {selectedCount} selected
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="md"
          fullWidth
          className="min-h-[48px]"
          icon={<ShoppingBag className="w-4 h-4" aria-hidden />}
          onClick={add}
        >
          Add to basket
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="md"
          fullWidth
          className="min-h-[48px]"
          onClick={remove}
        >
          Remove
        </Button>
      </div>
    </div>
  );
});

export default WishlistMobileBulkBar;
