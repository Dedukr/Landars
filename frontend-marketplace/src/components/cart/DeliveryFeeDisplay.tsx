"use client";
import React, { memo } from "react";

interface DeliveryFeeDisplayProps {
  deliveryFee: number;
  isFree: boolean;
  reasoning?: string;
  hasSausages?: boolean;
  weight?: number;
  dependsOnCourier?: boolean;
  overweight?: boolean;
  /** When true, show "Enter address" instead of a fee (checkout before address). */
  addressPending?: boolean;
}

const DeliveryFeeDisplay = memo<DeliveryFeeDisplayProps>(({
  deliveryFee,
  isFree,
  reasoning,
  hasSausages,
  weight,
  dependsOnCourier,
  overweight,
  addressPending = false,
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
          {addressPending ? (
            <span style={{ opacity: 0.7 }}>Enter address</span>
          ) : dependsOnCourier ? (
            <span style={{ opacity: 0.7 }}>Depends on courier</span>
          ) : isFree ? (
            "Free"
          ) : (
            `£${deliveryFee.toFixed(2)}`
          )}
        </span>
      </div>

      {/* Delivery Fee Breakdown */}
      {!addressPending && !dependsOnCourier && deliveryFee > 0 && (
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
      {(dependsOnCourier || overweight) && (
        <div
          className="text-xs"
          style={{ color: "var(--foreground)", opacity: 0.6 }}
        >
          {reasoning}
        </div>
      )}
    </>
  );
});

DeliveryFeeDisplay.displayName = "DeliveryFeeDisplay";

export default DeliveryFeeDisplay;
