"use client";
import React, { memo } from "react";
import Link from "next/link";

interface CheckoutButtonProps {
  totalItems: number;
}

const CheckoutButton = memo<CheckoutButtonProps>(({ totalItems }) => {
  return (
    <Link
      href="/checkout"
      className="block w-full py-3 px-4 rounded-lg font-semibold transition-colors text-center"
      style={{
        background: "var(--primary)",
        color: "white",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--primary-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--primary)";
      }}
    >
      Proceed to Checkout ({totalItems} items)
    </Link>
  );
});

CheckoutButton.displayName = "CheckoutButton";

export default CheckoutButton;
