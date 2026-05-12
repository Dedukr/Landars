"use client";
import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";

interface CartPageHeaderProps {
  totalItems: number;
}

export default function CartPageHeader({ totalItems }: CartPageHeaderProps) {
  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            <ShoppingBag
              className="w-6 h-6 sm:w-7 sm:h-7 shrink-0"
              style={{ color: "var(--accent)" }}
              aria-hidden="true"
            />
            Your basket
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {totalItems > 0
              ? `${totalItems} ${totalItems === 1 ? "item" : "items"} · Review your order before continuing`
              : "Add items from the shop to begin your order"}
          </p>
        </div>

        <Link
          href="/shop"
          className="flex items-center gap-1.5 text-sm font-medium shrink-0 transition-colors hover:opacity-80"
          style={{ color: "var(--primary)" }}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Continue shopping</span>
          <span className="sm:hidden">Shop</span>
        </Link>
      </div>
    </header>
  );
}
