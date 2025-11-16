"use client";
import React, { memo } from "react";

interface DeliveryFeeDisplayProps {
  deliveryFee: number;
  isFree: boolean;
  reasoning?: string;
  hasSausages?: boolean;
  weight?: number;
}

const DeliveryFeeDisplay = memo<DeliveryFeeDisplayProps>(({ 
  deliveryFee, 
  isFree, 
  reasoning, 
  hasSausages, 
  weight 
}) => {
  return (
    <>
      <div className="flex justify-between text-sm">
        <span
          style={{ color: "var(--foreground)", opacity: 0.7 }}
        >
          Delivery Fee
        </span>
        <span
          className="font-medium"
          style={{ color: "var(--foreground)" }}
        >
          {isFree ? "Free" : `£${deliveryFee.toFixed(2)}`}
        </span>
      </div>

      {/* Delivery Fee Breakdown */}
      {deliveryFee > 0 && (
        <div
          className="text-xs"
          style={{ color: "var(--foreground)", opacity: 0.6 }}
        >
          {reasoning}
          {hasSausages && (
            <span>
              {" "}
              • Weight: {weight?.toFixed(1)}kg
            </span>
          )}
        </div>
      )}
    </>
  );
});

DeliveryFeeDisplay.displayName = "DeliveryFeeDisplay";

export default DeliveryFeeDisplay;
