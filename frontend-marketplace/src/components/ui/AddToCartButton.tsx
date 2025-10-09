"use client";
import React from "react";
import { Button, ButtonProps } from "./Button";

interface AddToCartButtonProps extends Omit<ButtonProps, "variant" | "icon"> {
  inCart?: boolean;
  quantity?: number;
  isInStock?: boolean;
  onAdd?: (e?: React.MouseEvent) => void;
  onRemove?: (e?: React.MouseEvent) => void;
  compact?: boolean;
}

export const AddToCartButton: React.FC<AddToCartButtonProps> = ({
  inCart = false,
  quantity = 0,
  isInStock = true,
  onAdd,
  onRemove,
  children,
  compact = false,
  ...props
}) => {
  const CartIcon = () => (
    <svg
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h7.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );

  const PlusIcon = () => (
    <svg
      width="16"
      height="16"
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
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M20 12H4" />
    </svg>
  );

  if (!isInStock) {
    return (
      <Button variant="outline" disabled className="w-full" {...props}>
        Out of Stock
      </Button>
    );
  }

  if (inCart && quantity > 0) {
    return (
      <div
        className={
          compact ? "flex items-center gap-1" : "flex items-center gap-2 w-full"
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => onRemove?.(e)}
          icon={<MinusIcon />}
          className="flex-shrink-0 rounded-full w-9 h-9 p-0"
        />
        {compact ? (
          <span className="min-w-[2rem] text-center font-medium text-sm">
            {quantity}
          </span>
        ) : (
          <span className="flex-1 text-center font-medium text-sm">
            {quantity} in cart
          </span>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={(e) => onAdd?.(e)}
          icon={<PlusIcon />}
          className="flex-shrink-0 rounded-full w-9 h-9 p-0"
        />
      </div>
    );
  }

  return (
    <Button
      variant="primary"
      onClick={(e) => onAdd?.(e)}
      icon={<CartIcon />}
      className={compact ? undefined : "w-full"}
      size={compact ? "sm" : props.size}
      {...props}
    >
      {children || "Add to Cart"}
    </Button>
  );
};
