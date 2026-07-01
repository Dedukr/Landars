/**
 * Shared types for the public reviews feature.
 * These mirror the backend's ReviewPublicSerializer and ShopReviewMeView output.
 */

export interface PublicReview {
  id: number;
  user: number;
  user_name: string;
  product: number | null;
  product_name: string | null;
  product_slug: string | null;
  review_type: "product" | "shop";
  rating: number;
  title: string;
  comment: string;
  is_featured: boolean;
  is_verified_purchase?: boolean;
  created_at: string;
}

export interface ReviewMeStatus {
  can_review: boolean;
  has_order: boolean;
  has_existing_review: boolean;
  review: {
    id: number;
    rating: number;
    title: string;
    comment: string;
    created_at: string;
  } | null;
}

export interface ReviewStats {
  avg: number;
  total: number;
  /** dist[0] = count of 5-star, dist[4] = count of 1-star */
  dist: [number, number, number, number, number];
}

/** Derive ReviewStats from a list of reviews. */
export function computeReviewStats(reviews: PublicReview[]): ReviewStats {
  const unique = Array.from(new Map(reviews.map((r) => [r.id, r])).values());
  if (!unique.length) return { avg: 0, total: 0, dist: [0, 0, 0, 0, 0] };
  let sum = 0;
  const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  unique.forEach((r) => {
    const n = Math.min(5, Math.max(1, Math.round(r.rating)));
    sum += n;
    dist[5 - n]++;
  });
  return { avg: sum / unique.length, total: unique.length, dist };
}
