"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRaf = useRef<number | null>(null);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el || imageUrls.length <= 1) return;
      const clamped = Math.max(0, Math.min(imageUrls.length - 1, index));
      const w = el.clientWidth;
      if (w <= 0) return;
      el.scrollTo({ left: clamped * w, behavior });
      setSelected(clamped);
    },
    [imageUrls.length]
  );

  const onScrollSnapSync = useCallback(() => {
    const el = scrollRef.current;
    if (!el || imageUrls.length <= 1) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const next = Math.round(el.scrollLeft / w);
    const clamped = Math.max(0, Math.min(imageUrls.length - 1, next));
    setSelected((prev) => (prev === clamped ? prev : clamped));
  }, [imageUrls.length]);

  const onScroll = useCallback(() => {
    if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(onScrollSnapSync);
  }, [onScrollSnapSync]);

  useEffect(() => {
    return () => {
      if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
    };
  }, []);

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

  const frameClass =
    "relative w-full aspect-[4/3] max-h-[min(48vh,420px)] sm:max-h-[min(56vh,480px)] lg:max-h-none lg:aspect-square rounded-2xl overflow-hidden border";

  if (imageUrls.length === 1) {
    return (
      <div className="space-y-3">
        <div
          className={frameClass}
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
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={`${frameClass}`}
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-thin"
          style={{ WebkitOverflowScrolling: "touch" }}
          role="region"
          aria-roledescription="carousel"
          aria-label={`${productName} photos — scroll or swipe sideways`}
        >
          {imageUrls.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="relative h-full min-w-full shrink-0 snap-start"
            >
              <Image
                src={url}
                alt={`${productName} — image ${index + 1} of ${imageUrls.length}`}
                fill
                className="object-cover pointer-events-none select-none"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority={index === 0}
                loading={index === 0 ? "eager" : "lazy"}
                draggable={false}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          aria-label="Previous image"
          onClick={() => scrollToIndex(safeIndex - 1)}
          disabled={safeIndex <= 0}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border shadow-md opacity-90 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-25"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--sidebar-border)",
            color: "var(--foreground)",
          }}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Next image"
          onClick={() => scrollToIndex(safeIndex + 1)}
          disabled={safeIndex >= imageUrls.length - 1}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border shadow-md opacity-90 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-25"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--sidebar-border)",
            color: "var(--foreground)",
          }}
        >
          <ChevronRight className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>

        <div
          className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums shadow-sm border"
          style={{
            background: "color-mix(in srgb, var(--card-bg) 92%, transparent)",
            borderColor: "var(--sidebar-border)",
            color: "var(--foreground)",
          }}
          aria-live="polite"
        >
          {safeIndex + 1} / {imageUrls.length}
        </div>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin -mx-1 px-1"
        role="tablist"
        aria-label="Product images"
      >
        {imageUrls.map((url, index) => (
          <button
            key={`thumb-${url}-${index}`}
            type="button"
            role="tab"
            aria-selected={index === safeIndex}
            onClick={() => scrollToIndex(index)}
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
    </div>
  );
}
