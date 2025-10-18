"use client";
import React from "react";
import { Button, ButtonProps } from "./Button";

interface WishlistButtonProps extends Omit<ButtonProps, "variant" | "icon"> {
  isInWishlist?: boolean;
  onToggle?: () => void;
}

export const WishlistButton: React.FC<WishlistButtonProps> = ({
  isInWishlist = false,
  onToggle,
  ...props
}) => {
  const HeartIcon = ({ filled }: { filled: boolean }) => (
    <svg
      width="18"
      height="18"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      className="transition-all duration-200"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      icon={<HeartIcon filled={isInWishlist} />}
      className={`
        w-10 h-10 p-0 rounded-full
        ${
          isInWishlist
            ? "text-red-500 hover:text-red-600"
            : "text-gray-500 hover:text-red-500"
        }
        transition-all duration-200
        hover:scale-110
        active:scale-95
      `}
      style={{
        background: "white",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
      }}
      title={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
      {...props}
    />
  );
};
