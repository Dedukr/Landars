import React from "react";
import Link from "next/link";
import { Quote, Package, ChevronRight, Award } from "lucide-react";
import { StarDisplay } from "./StarRating";
import ReviewTypeBadge from "./ReviewTypeBadge";
import { ReviewAvatar, formatReviewDate } from "./ReviewCard";
import type { PublicReview } from "./types";

interface FeaturedReviewProps {
  review: PublicReview;
}

/**
 * Large, visually prominent card for a single featured review.
 * Displays at the top of the reviews page, above the grid.
 */
export default function FeaturedReview({ review }: FeaturedReviewProps) {
  const hasProductLink = review.review_type === "product" && review.product_slug;

  return (
    <article
      className="relative rounded-3xl border overflow-hidden transition-shadow duration-300 hover:shadow-xl"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "0 4px 28px rgba(0,0,0,0.07)",
      }}
    >
      {/* Decorative accent strip — thicker for visual anchor */}
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: "var(--accent)" }}
        aria-hidden
      />

      <div className="p-7 sm:p-10">
        {/* Badge row */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border"
            style={{
              background: "rgba(245,158,11,0.12)",
              color: "#b45309",
              borderColor: "rgba(245,158,11,0.3)",
            }}
          >
            <Award className="w-3.5 h-3.5" aria-hidden />
            Featured review
          </span>
          <ReviewTypeBadge type={review.review_type} />
          <StarDisplay value={review.rating} size="sm" />
        </div>

        {/* Quote icon + comment */}
        <div className="relative">
          <Quote
            className="absolute -top-2 -left-1 w-10 h-10 opacity-20"
            style={{ color: "var(--accent)" }}
            aria-hidden
          />
          <blockquote className="pl-8 sm:pl-10">
            {review.title && (
              <p
                className="text-xl sm:text-2xl font-bold leading-snug mb-3"
                style={{ color: "var(--foreground)" }}
              >
                {review.title}
              </p>
            )}
            <p
              className="text-base leading-relaxed"
              style={{ color: "var(--foreground)", opacity: 0.9 }}
            >
              {review.comment}
            </p>
          </blockquote>
        </div>

        {/* Footer: reviewer + product link */}
        <div
          className="mt-7 pt-5 border-t flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <div className="flex items-center gap-3">
            <ReviewAvatar name={review.user_name} size="md" />
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                {review.user_name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                {formatReviewDate(review.created_at)}
              </p>
            </div>
          </div>

          {hasProductLink && (
            <Link
              href={`/product/${review.product_slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium rounded-xl px-4 py-2 border transition-opacity hover:opacity-70 w-fit"
              style={{
                borderColor: "var(--sidebar-border)",
                color: "var(--muted-foreground)",
                background: "var(--background)",
              }}
            >
              <Package className="w-3.5 h-3.5" aria-hidden />
              {review.product_name}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
