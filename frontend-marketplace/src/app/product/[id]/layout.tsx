import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { ProductDetail } from "@/components/product/types";
import { collectProductImageUrls } from "@/components/product/collectProductImageUrls";
import { getServerApiOriginForProductFetch } from "@/lib/serverProductMetadataFetch";

const SITE = "Landar's Food";

function trimDescription(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function fetchProductForMetadata(id: string): Promise<ProductDetail | null> {
  const origin = getServerApiOriginForProductFetch();
  const url = `${origin}/api/products/${encodeURIComponent(id)}/`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    return (await res.json()) as ProductDetail;
  } catch {
    return null;
  }
}

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProductForMetadata(id);

  if (!product?.name) {
    return {
      title: "Product",
      description: `Browse our range on ${SITE}. This product may not be available.`,
    };
  }

  const desc =
    trimDescription(product.description) ?? `Shop ${product.name} at ${SITE}.`;

  const imageUrls = collectProductImageUrls(product);
  const primaryImage = imageUrls[0];
  const ogImages =
    primaryImage && isAbsoluteUrl(primaryImage)
      ? [{ url: primaryImage, alt: product.name }]
      : undefined;

  return {
    title: product.name,
    description: desc,
    openGraph: {
      title: product.name,
      description: desc,
      type: "website",
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: ogImages ? "summary_large_image" : "summary",
      title: product.name,
      description: desc,
      ...(primaryImage && isAbsoluteUrl(primaryImage) ? { images: [primaryImage] } : {}),
    },
  };
}

export default function ProductDetailLayout({ children }: { children: ReactNode }) {
  return children;
}
