/** Minimal product shape for resolving a display image (shop + cart). */
export interface ProductLikeForImage {
  image_url?: string | null;
  images?: (string | { image_url: string })[];
  primary_image?: string | null;
}

/**
 * First usable image URL for product cards and cart lines.
 * Matches shop listing logic: `images[]` then `image_url` then `primary_image`.
 */
export function getPrimaryProductImageUrl(
  product: ProductLikeForImage
): string | null {
  if (product.images && product.images.length > 0) {
    for (const img of product.images) {
      if (typeof img === "string") {
        const t = img.trim();
        if (t) return t;
      }
      if (
        img &&
        typeof img === "object" &&
        "image_url" in img &&
        (img as { image_url: string }).image_url
      ) {
        const u = String((img as { image_url: string }).image_url).trim();
        if (u) return u;
      }
    }
  }
  const single = product.image_url ?? product.primary_image;
  const trimmed = single != null ? String(single).trim() : "";
  return trimmed || null;
}
