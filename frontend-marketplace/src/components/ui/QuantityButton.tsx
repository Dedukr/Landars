"use client";
import React from "react";
import { Button, ButtonProps } from "./Button";

interface QuantityButtonProps extends Omit<ButtonProps, "variant" | "icon"> {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export const QuantityButton: React.FC<QuantityButtonProps> = ({
  quantity,
  onIncrement,
  onDecrement,
  min = 0,
  max = 999,
  disabled = false,
  ...props
}) => {
  const PlusIcon = () => (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  );

  const MinusIcon = () => (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M20 12H4" />
    </svg>
  );

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onDecrement}
        disabled={disabled || quantity <= min}
        icon={<MinusIcon />}
        className="w-8 h-8 p-0 rounded-md"
        {...props}
      />
      <span className="min-w-[2rem] text-center text-sm font-medium">
        {quantity}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onIncrement}
        disabled={disabled || quantity >= max}
        icon={<PlusIcon />}
        className="w-8 h-8 p-0 rounded-md"
        {...props}
      />
    </div>
  );
};
