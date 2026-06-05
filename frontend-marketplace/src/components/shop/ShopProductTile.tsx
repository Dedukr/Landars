"use client";

import React, { useCallback } from "react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import type { ShopCatalogProduct } from "@/lib/shopCatalogClient";
import type { SignInPopupVariant } from "@/components/SignInPopup";

interface ShopProductTileProps {
  product: ShopCatalogProduct;
  user: { id: number } | null;
  onRequireSignIn: (variant: SignInPopupVariant) => void;
}

function ShopProductTile({
  product,
  user,
  onRequireSignIn,
}: ShopProductTileProps) {
  const { cart, addToCart, removeFromCart } = useCart();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();

  const cartItem = cart.find((item) => item.productId === product.id);
  const inWishlist = isInWishlist(product.id);

  const handleWishlistToggle = useCallback(() => {
    if (!user) {
      onRequireSignIn("wishlist");
      return;
    }
    if (inWishlist) removeFromWishlist(product.id);
    else addToWishlist(product.id);
  }, [user, inWishlist, removeFromWishlist, addToWishlist, product.id, onRequireSignIn]);

  const handleAddToCart = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (!user) {
        onRequireSignIn("cart");
        return;
      }
      addToCart(product.id, 1);
    },
    [user, addToCart, product.id, onRequireSignIn]
  );

  const handleRemoveFromCart = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (!user) return;
      removeFromCart(product.id);
    },
    [user, removeFromCart, product.id]
  );

  return (
    <ShopProductCard
      product={product}
      user={user}
      cartItemQuantity={cartItem?.quantity ?? 0}
      inWishlist={inWishlist}
      onWishlistToggle={handleWishlistToggle}
      onAddToCart={handleAddToCart}
      onRemoveFromCart={handleRemoveFromCart}
    />
  );
}

export default React.memo(ShopProductTile);
