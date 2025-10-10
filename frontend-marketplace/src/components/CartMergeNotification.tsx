/**
 * Cart Merge Notification Component
 *
 * Displays intelligent feedback to users when their cart is merged
 * following login. Shows conflicts resolved and merge summary.
 */

"use client";
import React, { useState, useEffect } from "react";
import { useCart } from "@/contexts/CartContext";
// Types are used in the component via useCart hook

interface CartMergeNotificationProps {
  onDismiss?: () => void;
  autoHide?: boolean;
  hideDelay?: number;
}

export const CartMergeNotification: React.FC<CartMergeNotificationProps> = ({
  onDismiss,
  autoHide = true,
  hideDelay = 5000,
}) => {
  const { mergeConflicts, lastMergeSummary } = useCart();
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

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
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <div
        className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 animate-slide-in-right"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          color: "var(--foreground)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <h3 className="font-semibold text-sm">Cart Merged Successfully</h3>
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

        {/* Summary */}
        {lastMergeSummary && (
          <div className="mb-3">
            <p className="text-sm text-gray-600 mb-2">
              Your cart has been updated with items from your previous session.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span>Total items:</span>
                <span className="font-medium">
                  {lastMergeSummary.totalItems}
                </span>
              </div>
              {lastMergeSummary.conflictsResolved > 0 && (
                <div className="flex justify-between">
                  <span>Conflicts resolved:</span>
                  <span className="font-medium text-orange-600">
                    {lastMergeSummary.conflictsResolved}
                  </span>
                </div>
              )}
              {lastMergeSummary.itemsAdded > 0 && (
                <div className="flex justify-between">
                  <span>Items added:</span>
                  <span className="font-medium text-green-600">
                    {lastMergeSummary.itemsAdded}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Conflicts Details */}
        {mergeConflicts.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              <span>{showDetails ? "Hide" : "Show"} conflict details</span>
              <svg
                className={`w-3 h-3 transition-transform ${
                  showDetails ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showDetails && (
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                {mergeConflicts.map((conflict, index) => (
                  <div
                    key={index}
                    className="text-xs bg-gray-50 p-2 rounded border"
                  >
                    <div className="font-medium text-gray-800">
                      {conflict.productName}
                    </div>
                    <div className="flex justify-between text-gray-600 mt-1">
                      <span>Local: {conflict.localQuantity}</span>
                      <span>Backend: {conflict.backendQuantity}</span>
                      <span className="font-medium">
                        Final: {conflict.finalQuantity}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Resolution: {getResolutionText(conflict.resolution)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={handleDismiss}
            className="flex-1 bg-blue-600 text-white text-xs py-2 px-3 rounded hover:bg-blue-700 transition-colors"
          >
            View Cart
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 bg-gray-200 text-gray-700 text-xs py-2 px-3 rounded hover:bg-gray-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Get human-readable text for conflict resolution
 */
function getResolutionText(resolution: string): string {
  switch (resolution) {
    case "keep_higher":
      return "Kept higher quantity";
    case "keep_local":
      return "Kept local quantity";
    case "keep_backend":
      return "Kept backend quantity";
    case "sum_quantities":
      return "Summed quantities";
    case "prompt_user":
      return "User decision required";
    default:
      return "Automatic resolution";
  }
}

export default CartMergeNotification;
