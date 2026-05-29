import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Package } from "lucide-react";

interface HomeProduct {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  images?: Array<string | { image_url: string }>;
  primary_image?: string | null;
  categories?: string[];
  sold_quantity?: number;
}

interface HomeProductCardProps {
  product: HomeProduct;
  className?: string;
}

function getFirstImage(product: HomeProduct): string | null {
  if (product.primary_image) return product.primary_image;
  if (product.image_url) return product.image_url;
  if (product.images && product.images.length > 0) {
    const first = product.images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "image_url" in first) return first.image_url;
  }
  return null;
}

export default function HomeProductCard({ product, className = "" }: HomeProductCardProps) {
  const imageUrl = getFirstImage(product);
  const price = product.price ? parseFloat(String(product.price)).toFixed(2) : null;
  const description = product.description
    ? product.description.length > 60
      ? product.description.slice(0, 60) + "…"
      : product.description
    : null;

  return (
    <Link
      href={`/product/${product.id}`}
      className={`group flex flex-col rounded-2xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 ${className}`}
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      {/* Product image */}
      <div
        className="relative h-44 overflow-hidden flex-shrink-0"
        style={{ background: "var(--sidebar-bg)" }}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package
              className="w-12 h-12 opacity-30"
              style={{ color: "var(--muted-foreground)" }}
            />
          </div>
        )}

        {/* Category badge */}
        {product.categories && product.categories.length > 0 && (
          <div className="absolute top-2.5 left-2.5">
            <span
              className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: "var(--sidebar-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              {product.categories[0]}
            </span>
          </div>
        )}
        {typeof product.sold_quantity === "number" && product.sold_quantity > 0 && (
          <div className="absolute top-2.5 right-2.5">
            <span
              className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
              style={{
                background: "var(--success-bg)",
                color: "var(--success-text)",
                border: "1px solid var(--success-border)",
              }}
              title="Units sold on completed orders"
            >
              {product.sold_quantity} sold
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4">
        <h3
          className="font-semibold text-sm leading-snug mb-1 whitespace-normal break-words"
          style={{ color: "var(--foreground)" }}
          title={product.name}
        >
          {product.name}
        </h3>

        {description && (
          <p
            className="text-xs leading-relaxed mb-2 flex-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            {description}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-2">
          {price && (
            <span
              className="text-base font-bold"
              style={{ color: "var(--primary)" }}
            >
              £{price}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 text-xs font-medium transition-opacity group-hover:opacity-70"
            style={{ color: "var(--accent)" }}
          >
            View
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
