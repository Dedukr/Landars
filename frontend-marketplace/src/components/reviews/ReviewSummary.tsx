import React from "react";
import { StarDisplay } from "./StarRating";
import type { ReviewStats } from "./types";

interface ReviewSummaryProps {
  stats: ReviewStats;
  className?: string;
}

const STAR_LABELS = ["5 stars", "4 stars", "3 stars", "2 stars", "1 star"];

/**
 * Aggregate rating summary: big score, star row, count, and per-star distribution bars.
 */
export default function ReviewSummary({ stats, className = "" }: ReviewSummaryProps) {
  if (!stats.total) {
    return (
      <div
        className={`rounded-2xl border p-8 flex flex-col items-center text-center gap-3 ${className}`}
        style={{ background: "var(--card-bg)", borderColor: "var(--sidebar-border)" }}
      >
        <p className="text-4xl font-extrabold" style={{ color: "var(--foreground)" }}>—</p>
        <StarDisplay value={0} size="lg" />
        <div>
          <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            No reviews yet
          </p>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Be the first to share your experience with us.
          </p>
        </div>
      </div>
    );
  }

  const maxDist = Math.max(...stats.dist, 1);

  return (
    <div
      className={`rounded-2xl border flex flex-col sm:flex-row ${className}`}
      style={{ background: "var(--card-bg)", borderColor: "var(--sidebar-border)" }}
    >
      {/* Big score column */}
      <div
        className="flex flex-col items-center justify-center gap-2 px-8 py-7 sm:border-r"
        style={{ minWidth: 160, borderColor: "var(--sidebar-border)" }}
      >
        <span
          className="text-6xl font-extrabold tracking-tight leading-none"
          style={{ color: "var(--foreground)" }}
        >
          {stats.avg.toFixed(1)}
        </span>
        <StarDisplay value={stats.avg} size="lg" />
        <p className="text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
          {stats.total} {stats.total === 1 ? "review" : "reviews"}
        </p>
        <p className="text-xs text-center" style={{ color: "var(--muted-foreground)", opacity: 0.7 }}>
          from verified customers
        </p>
      </div>

      {/* Distribution bars column */}
      <div className="flex-1 flex flex-col justify-center gap-2.5 px-7 py-7">
        {stats.dist.map((count, i) => {
          const pct = Math.round((count / maxDist) * 100);
          return (
            <div key={i} className="flex items-center gap-3">
              <span
                className="text-xs w-14 shrink-0 text-right tabular-nums"
                style={{ color: "var(--muted-foreground)" }}
              >
                {STAR_LABELS[i]}
              </span>
              <div
                className="flex-1 rounded-full overflow-hidden h-2.5"
                style={{ background: "var(--sidebar-border)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: "var(--accent)" }}
                />
              </div>
              <span
                className="text-xs w-5 shrink-0 tabular-nums"
                style={{ color: "var(--muted-foreground)" }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
