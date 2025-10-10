"use client";
import React, { memo, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  image_url?: string | null;
  categories?: string[];
}
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { AddToCartButton } from "./ui/AddToCartButton";
import { WishlistButton } from "./ui/WishlistButton";
import { Button } from "./ui/Button";

interface ProductCardProps {
  product: Product;
  onWishlistToggle?: (productId: number) => void;
  onCartToggle?: (productId: number) => void;
}

const ProductCard = memo<ProductCardProps>(
  ({ product, onWishlistToggle, onCartToggle }) => {
    const { cart, addToCart, removeFromCart } = useCart();
    const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();

    // Memoize cart item lookup to prevent unnecessary recalculations
    const cartItem = useMemo(
      () => cart.find((item) => item.productId === product.id),
      [cart, product.id]
    );
    const cartQuantity = cartItem?.quantity || 0;

    // Memoize wishlist status
    const inWishlist = useMemo(
      () => isInWishlist(product.id),
      [isInWishlist, product.id]
    );

    const handleWishlistClick = useCallback(() => {
      if (inWishlist) {
        removeFromWishlist(product.id);
      } else {
        addToWishlist(product.id);
      }

      onWishlistToggle?.(product.id);
    }, [
      product.id,
      inWishlist,
      removeFromWishlist,
      addToWishlist,
      onWishlistToggle,
    ]);

    const handleAddToCart = useCallback(
      (e?: React.MouseEvent) => {
        e?.stopPropagation();
        addToCart(product.id, 1);
        onCartToggle?.(product.id);
      },
      [product.id, addToCart, onCartToggle]
    );

    const handleRemoveFromCart = useCallback(
      (e?: React.MouseEvent) => {
        e?.stopPropagation();
        removeFromCart(product.id);
        onCartToggle?.(product.id);
      },
      [product.id, removeFromCart, onCartToggle]
    );

    return (
      <div
        className="rounded-lg shadow p-4 flex flex-col hover:shadow-lg transition-shadow border animate-fade-in-up relative h-80 focus-within:ring-2 focus-within:ring-offset-2"
        style={{
          background: "var(--card-bg)",
          color: "var(--foreground)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        {/* Wishlist Heart Icon - positioned in top-right corner */}
        <div className="absolute top-3 right-3 z-10">
          <WishlistButton
            isInWishlist={inWishlist}
            onToggle={handleWishlistClick}
          />
        </div>

        {/* Product Link */}
        <Link
          href={`/product/${product.id}`}
          className="flex flex-col flex-grow cursor-pointer outline-none focus:outline-none"
        >
          {/* Image section - fixed height with lazy loading */}
          <div className="h-32 w-full flex items-center justify-center bg-gray-50 rounded mb-2 overflow-hidden flex-shrink-0 relative">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                className="object-cover h-full w-full"
                width={128}
                height={128}
                loading="lazy"
                placeholder="blur"
                blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
              />
            ) : (
              <span className="text-4xl text-gray-300">🍎</span>
            )}
          </div>

          {/* Content section - grows to fill available space */}
          <div className="flex flex-col flex-grow">
            <div
              className="font-semibold text-lg truncate mb-1"
              title={product.name}
            >
              {product.name}
            </div>
            <div
              className="text-sm truncate flex-grow"
              style={{ color: "var(--foreground)" }}
              title={product.description}
            >
              {product.description.length > 48
                ? product.description.slice(0, 48) + "..."
                : product.description}
            </div>
          </div>
        </Link>

        {/* Price and Add to Cart - always at bottom */}
        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between">
            {/* Price tag */}
            <div
              className="font-bold text-lg"
              style={{ color: "var(--primary)" }}
            >
              £{product.price}
            </div>

            {/* Add to Cart Button */}
            {cartItem ? (
              <AddToCartButton
                compact
                inCart
                quantity={cartQuantity}
                onAdd={handleAddToCart}
                onRemove={handleRemoveFromCart}
              />
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddToCart}
                className="text-sm"
              >
                Add to Cart
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ProductCard.displayName = "ProductCard";

export default ProductCard;
