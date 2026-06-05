"use client";

import React from "react";
import Image from "next/image";
import { Package } from "lucide-react";

interface ShopProductImageProps {
  src: string | null;
  alt: string;
}

/**
 * Product thumbnail for shop cards. Uses a stable Next/Image instance so parent
 * re-renders (filters, cart, wishlist) do not reload already-fetched images.
 */
function ShopProductImage({ src, alt }: ShopProductImageProps) {
  if (!src) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 sm:gap-2 p-3 sm:p-4 text-center">
        <Package className="w-7 h-7 sm:w-10 sm:h-10 opacity-35" aria-hidden />
        <span
          className="text-[10px] sm:text-xs font-medium"
          style={{ color: "var(--muted-foreground)" }}
        >
          Photo coming soon
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 24vw"
      priority={false}
    />
  );
}

export default React.memo(ShopProductImage);
