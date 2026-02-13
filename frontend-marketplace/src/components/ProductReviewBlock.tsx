"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import { httpClient } from "@/utils/httpClient";

export interface Review {
  id: number;
  user: number;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
  is_verified_purchase?: boolean;
}

interface ProductReviewBlockProps {
  productId: number;
}

const STAR_COLOR = "#f59e0b"; // amber-500
const STAR_EMPTY = "var(--muted-foreground)";

function StarRating({
  value,
  max = 5,
  size = "md",
  showValue,
}: {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
}) {
  const sizeMap = { sm: "text-sm", md: "text-base", lg: "text-2xl" };
  const sizeClass = sizeMap[size];
  return (
    <span className={`inline-flex items-center gap-1 ${sizeClass}`} aria-label={`${value} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{ color: i < Math.round(value) ? STAR_COLOR : STAR_EMPTY }}>
          ★
        </span>
      ))}
      {showValue !== false && size !== "sm" && (
        <span className="ml-1 font-medium tabular-nums" style={{ color: "var(--foreground)" }}>
          {Number(value).toFixed(1)}
        </span>
      )}
    </span>
  );
}

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return d.toLocaleDateString();
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

export default function ProductReviewBlock({ productId }: ProductReviewBlockProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const signInUrl = getAuthUrl({ mode: "signin", next: pathname });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formRating, setFormRating] = useState(5);
  const [formComment, setFormComment] = useState("");

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetch(`/api/products/${productId}/reviews/`, { credentials: "include" }).then((r) =>
        r.ok ? r.json() : []
      );
      setReviews(Array.isArray(data) ? data : []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push(signInUrl);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await httpClient.post(`/api/products/${productId}/reviews/`, {
        rating: formRating,
        comment: formComment.trim(),
      });
      setFormRating(5);
      setFormComment("");
      await fetchReviews();
    } catch (err: unknown) {
      let message = "Failed to submit review.";

      type ErrorResponseData = {
        error?: string;
        [key: string]: unknown;
      };

      type HttpError = Error & {
        response?: {
          data?: ErrorResponseData;
          status: number;
        };
      };

      if (err instanceof Error) {
        const anyErr = err as HttpError;
        const data = anyErr.response?.data;

        if (data?.error && typeof data.error === "string") {
          // Backend-provided error message, e.g. unique-review constraint
          message = data.error;
        } else if (data && typeof data === "object") {
          // Surface first field error if available (e.g. { rating: ["..."] })
          const keys = Object.keys(data);
          if (keys.length > 0) {
            const firstVal = data[keys[0]];
            if (Array.isArray(firstVal) && firstVal.length > 0 && typeof firstVal[0] === "string") {
              message = firstVal[0];
            }
          }
        } else if (anyErr.message) {
          message = anyErr.message;
        }
      }

      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const { average, distribution, total } = useMemo(() => {
    const total = reviews.length;
    // distribution index mapping: 0→5★, 1→4★, 2→3★, 3→2★, 4→1★
    const counts = [0, 0, 0, 0, 0];
    if (total === 0) return { average: 0, distribution: counts, total: 0 };

    let sum = 0;
    reviews.forEach((r) => {
      // Clamp and normalise rating to 1–5 integer
      const rating = Math.min(5, Math.max(1, Math.round(r.rating)));
      sum += rating;
      const index = 5 - rating; // 5★→0, 4★→1, … 1★→4
      counts[index] += 1;
    });

    return {
      average: sum / total,
      distribution: counts,
      total,
    };
  }, [reviews]);

  return (
    <section
      className="rounded-xl border p-6 sm:p-8"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
      }}
      aria-labelledby="reviews-heading"
    >
      <h2 id="reviews-heading" className="text-2xl font-semibold mb-6" style={{ color: "var(--foreground)" }}>
        Customer reviews
      </h2>

      {loading ? (
        <div className="py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          Loading reviews…
        </div>
      ) : (
        <>
          {/* Summary + distribution (standard pattern: average, count, bars) */}
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 mb-8 pb-8" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
            <div className="flex flex-col items-start gap-1 min-w-[140px]">
              <StarRating value={average} size="lg" showValue={true} />
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Based on {total} {total === 1 ? "review" : "reviews"}
              </p>
            </div>
            <div className="flex-1 w-full max-w-xs">
              {[5, 4, 3, 2, 1].map((stars, i) => {
                const count = total ? distribution[i] ?? 0 : 0;
                const pct = total ? (count / total) * 100 : 0;
                return (
                  <div key={stars} className="flex items-center gap-3 py-1">
                    <span className="text-xs w-12 shrink-0" style={{ color: "var(--muted-foreground)" }}>
                      {stars} star
                    </span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--sidebar-bg)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: STAR_COLOR }}
                      />
                    </div>
                    <span className="text-xs w-8 text-right tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Write a review */}
          <div
            className="rounded-lg p-5 mb-8"
            style={{
              background: "var(--sidebar-bg)",
              border: "1px solid var(--sidebar-border)",
            }}
          >
            <h3 className="font-semibold mb-4" style={{ color: "var(--foreground)" }}>
              Write a review
            </h3>
            {user ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--foreground)" }}>
                    Your rating
                  </label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormRating(r)}
                        className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-offset-1"
                        style={{
                          color: r <= formRating ? STAR_COLOR : STAR_EMPTY,
                          fontSize: "1.5rem",
                          lineHeight: 1,
                        }}
                        aria-label={`${r} stars`}
                        aria-pressed={formRating === r}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--foreground)" }}>
                    Your review (optional)
                  </label>
                  <textarea
                    value={formComment}
                    onChange={(e) => setFormComment(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm resize-y"
                    style={{
                      background: "var(--card-bg)",
                      borderColor: "var(--sidebar-border)",
                      color: "var(--foreground)",
                    }}
                    placeholder="What did you like or dislike? Would you recommend this product?"
                    maxLength={2000}
                  />
                  <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {formComment.length}/2000
                  </p>
                </div>
                {error && (
                  <p className="text-sm" style={{ color: "var(--destructive)" }}>
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50"
                  style={{
                    background: "var(--primary)",
                    color: "white",
                  }}
                >
                  {submitting ? "Submitting…" : "Submit review"}
                </button>
              </form>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Sign in to share your experience with this product.
                </p>
                <Link
                  href={signInUrl}
                  className="inline-flex justify-center px-5 py-2.5 rounded-lg font-medium text-sm shrink-0"
                  style={{
                    background: "var(--primary)",
                    color: "white",
                  }}
                >
                  Sign in to review
                </Link>
              </div>
            )}
          </div>

          {/* Review list */}
          <div>
            <h3 className="font-semibold mb-4" style={{ color: "var(--foreground)" }}>
              {total === 0 ? "No reviews yet" : "All reviews"}
            </h3>
            {total === 0 ? (
              <p className="text-sm py-4" style={{ color: "var(--muted-foreground)" }}>
                Be the first to review this product.
              </p>
            ) : (
              <ul className="space-y-4">
                {reviews.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-lg border p-4"
                    style={{
                      background: "var(--card-bg)",
                      borderColor: "var(--sidebar-border)",
                    }}
                  >
                    <div className="flex gap-3">
                      <div
                        className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-medium"
                        style={{
                          background: "var(--sidebar-bg)",
                          color: "var(--foreground)",
                        }}
                        aria-hidden
                      >
                        {getInitials(review.user_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                          <span className="font-medium text-sm" style={{ color: "var(--foreground)" }}>
                            {review.user_name}
                          </span>
                          {review.is_verified_purchase && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                background: "var(--success)",
                                color: "white",
                              }}
                              title="Verified purchase"
                            >
                              Purchased
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 text-sm">
                            {Array.from({ length: 5 }, (_, i) => (
                              <span key={i} style={{ color: i < review.rating ? STAR_COLOR : STAR_EMPTY }}>
                                ★
                              </span>
                            ))}
                          </span>
                          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                            {formatReviewDate(review.created_at)}
                          </span>
                        </div>
                        {review.comment ? (
                          <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--foreground)" }}>
                            {review.comment}
                          </p>
                        ) : (
                          <p className="text-sm mt-2 italic" style={{ color: "var(--muted-foreground)" }}>
                            No comment provided
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
