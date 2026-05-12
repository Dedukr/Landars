"use client";

import Image from "next/image";
import { useState } from "react";
import { Package } from "lucide-react";

interface ProductImageGalleryProps {
  imageUrls: string[];
  productName: string;
}

export default function ProductImageGallery({
  imageUrls,
  productName,
}: ProductImageGalleryProps) {
  const [selected, setSelected] = useState(0);
  const safeIndex = imageUrls.length ? Math.min(selected, imageUrls.length - 1) : 0;
  const mainSrc = imageUrls[safeIndex];

  if (imageUrls.length === 0) {
    return (
      <div
        className="relative w-full aspect-[4/3] max-h-[min(48vh,420px)] sm:max-h-none sm:aspect-[4/3] lg:aspect-square rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-2 border"
        style={{
          background: "var(--sidebar-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <Package className="h-12 w-12 opacity-30" aria-hidden style={{ color: "var(--muted-foreground)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
          Photo coming soon
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="relative w-full aspect-[4/3] max-h-[min(48vh,420px)] sm:max-h-[min(56vh,480px)] lg:max-h-none lg:aspect-square rounded-2xl overflow-hidden border"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <Image
          src={mainSrc}
          alt={productName}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
        />
      </div>
      {imageUrls.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin -mx-1 px-1"
          role="tablist"
          aria-label="Product images"
        >
          {imageUrls.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === safeIndex}
              onClick={() => setSelected(index)}
              className="relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 transition-all snap-start focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              style={{
                borderColor: index === safeIndex ? "var(--accent)" : "var(--sidebar-border)",
                opacity: index === safeIndex ? 1 : 0.85,
              }}
            >
              <Image
                src={url}
                alt={`${productName} — image ${index + 1}`}
                fill
                className="object-cover"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
