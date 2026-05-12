import type { ProductDetail } from "./types";

export function collectProductImageUrls(product: ProductDetail): string[] {
  if (product.images && product.images.length > 0) {
    const mapped = product.images
      .map((img) => {
        if (typeof img === "string") return img.trim() ? img : null;
        if (img && typeof img === "object" && "image_url" in img && img.image_url)
          return String(img.image_url).trim() || null;
        return null;
      })
      .filter((url): url is string => Boolean(url));
    if (mapped.length) return mapped;
  }
  const single = product.image_url || product.primary_image;
  return single && String(single).trim() ? [String(single).trim()] : [];
}
