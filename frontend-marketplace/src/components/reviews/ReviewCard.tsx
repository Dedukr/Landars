import React from "react";
import Link from "next/link";
import { Award, ShieldCheck, Package, ChevronRight } from "lucide-react";
import { StarDisplay } from "./StarRating";
import ReviewTypeBadge from "./ReviewTypeBadge";
import type { PublicReview } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  if (diff < 30)
    return `${Math.floor(diff / 7)} week${Math.floor(diff / 7) > 1 ? "s" : ""} ago`;
  if (diff < 365)
    return `${Math.floor(diff / 30)} month${Math.floor(diff / 30) > 1 ? "s" : ""} ago`;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// ── Avatar ────────────────────────────────────────────────────────────────────

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

export function ReviewAvatar({ name, size = "md" }: AvatarProps) {
  const sizeMap = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };
  return (
    <div
      className={`${sizeMap[size]} rounded-full shrink-0 flex items-center justify-center font-bold select-none`}
      style={{ background: "var(--accent)", color: "#fff" }}
      aria-hidden
    >
      {getInitials(name)}
    </div>
  );
}

// ── ReviewCard ────────────────────────────────────────────────────────────────

interface ReviewCardProps {
  review: PublicReview;
  /** Truncate comment at this character count (default 200, 0 = no limit) */
  maxCommentLength?: number;
}

export default function ReviewCard({ review, maxCommentLength = 200 }: ReviewCardProps) {
  const hasProductLink = review.review_type === "product" && review.product_slug;
  const comment =
    maxCommentLength > 0 && review.comment.length > maxCommentLength
      ? review.comment.slice(0, maxCommentLength) + "…"
      : review.comment;

  return (
    <article
      className="rounded-2xl border flex flex-col gap-3 p-5 h-full transition-shadow hover:shadow-md"
      style={{ background: "var(--card-bg)", borderColor: "var(--sidebar-border)" }}
    >
      {/* Header: avatar + name + date */}
      <div className="flex items-start gap-3">
        <ReviewAvatar name={review.user_name} />
        <div className="min-w-0 flex-1">
          <p
            className="font-semibold text-sm leading-tight truncate"
            style={{ color: "var(--foreground)" }}
          >
            {review.user_name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {formatReviewDate(review.created_at)}
          </p>
        </div>
        {review.is_featured && (
          <Award
            className="w-4 h-4 shrink-0"
            style={{ color: "#f59e0b" }}
            aria-label="Featured review"
          />
        )}
      </div>

      {/* Stars + type badge + verified badge */}
      <div className="flex flex-wrap items-center gap-2">
        <StarDisplay value={review.rating} size="sm" />
        <ReviewTypeBadge type={review.review_type} />
        {review.is_verified_purchase && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border"
            style={{
              background: "var(--success-bg)",
              color: "var(--success-text)",
              borderColor: "var(--success-border)",
            }}
          >
            <ShieldCheck className="w-3 h-3" aria-hidden />
            Verified
          </span>
        )}
      </div>

      {/* Title */}
      {review.title && (
        <p className="font-semibold text-sm leading-snug" style={{ color: "var(--foreground)" }}>
          {review.title}
        </p>
      )}

      {/* Comment */}
      <p
        className={`text-sm leading-relaxed flex-1 ${!comment ? "italic" : ""}`}
        style={{ color: comment ? "var(--foreground)" : "var(--muted-foreground)" }}
      >
        {comment || "No comment provided."}
      </p>

      {/* Product link */}
      {hasProductLink && (
        <Link
          href={`/product/${review.product_slug}`}
          className="inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70 mt-auto pt-2 border-t"
          style={{ color: "var(--muted-foreground)", borderColor: "var(--sidebar-border)" }}
        >
          <Package className="w-3 h-3" aria-hidden />
          {review.product_name}
          <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </article>
  );
}

// ── ReviewCardSkeleton ────────────────────────────────────────────────────────
// Animated placeholder shown while reviews are loading.

export function ReviewCardSkeleton() {
  return (
    <div
      className="rounded-2xl border p-5 space-y-3 animate-pulse"
      style={{ background: "var(--card-bg)", borderColor: "var(--sidebar-border)" }}
      aria-hidden
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full shrink-0"
          style={{ background: "var(--sidebar-border)" }}
        />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 rounded w-24" style={{ background: "var(--sidebar-border)" }} />
          <div className="h-2.5 rounded w-16" style={{ background: "var(--sidebar-border)" }} />
        </div>
      </div>
      <div className="h-3 rounded w-20" style={{ background: "var(--sidebar-border)" }} />
      <div className="space-y-1.5">
        <div className="h-2.5 rounded w-full" style={{ background: "var(--sidebar-border)" }} />
        <div className="h-2.5 rounded w-4/5" style={{ background: "var(--sidebar-border)" }} />
        <div className="h-2.5 rounded w-3/5" style={{ background: "var(--sidebar-border)" }} />
      </div>
    </div>
  );
}
