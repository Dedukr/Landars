/**
 * Cart Update Notification Component
 *
 * Displays a simple notification when the cart is updated.
 */

"use client";
import React, { useState, useEffect } from "react";
import { useCart } from "@/contexts/CartContext";

interface CartMergeNotificationProps {
  onDismiss?: () => void;
  autoHide?: boolean;
  hideDelay?: number;
}

export const CartMergeNotification: React.FC<CartMergeNotificationProps> = ({
  onDismiss,
  autoHide = true,
  hideDelay = 3000,
}) => {
  const { mergeConflicts, lastMergeSummary } = useCart();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (mergeConflicts.length > 0 || lastMergeSummary) {
      setIsVisible(true);

      if (autoHide) {
        const timer = setTimeout(() => {
          setIsVisible(false);
          onDismiss?.();
        }, hideDelay);

        return () => clearTimeout(timer);
      }
    }
  }, [mergeConflicts, lastMergeSummary, autoHide, hideDelay, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible || (!mergeConflicts.length && !lastMergeSummary)) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div
        className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 animate-slide-in-right"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          color: "var(--foreground)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <h3 className="font-semibold text-sm">Cart Updated</h3>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss notification"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CartMergeNotification;
