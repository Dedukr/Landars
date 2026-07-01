"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Star,
  ShieldCheck,
  Award,
  Truck,
  Leaf,
  Store,
} from "lucide-react";
import { httpClient } from "@/utils/httpClient";
import { API_ENDPOINTS } from "@/config/api";

import ReviewCard, { ReviewCardSkeleton } from "@/components/reviews/ReviewCard";
import FeaturedReview from "@/components/reviews/FeaturedReview";
import ReviewSummary from "@/components/reviews/ReviewSummary";
import ShopReviewForm from "@/components/reviews/ShopReviewForm";
import { computeReviewStats } from "@/components/reviews/types";
import type { PublicReview } from "@/components/reviews/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: "Verified customers" },
  { icon: Leaf,        label: "Fresh food" },
  { icon: Truck,       label: "Local delivery" },
  { icon: Store,       label: "Real product feedback" },
];

const SKELETON_COUNT = 6;

// ── Skeleton for the summary card ─────────────────────────────────────────────

function SummarySkeleton() {
  return (
    <div
      className="rounded-2xl border p-6 animate-pulse"
      style={{ background: "var(--card-bg)", borderColor: "var(--sidebar-border)" }}
      aria-hidden
    >
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex flex-col items-center gap-2 min-w-[120px]">
          <div className="h-14 w-16 rounded" style={{ background: "var(--sidebar-border)" }} />
          <div className="h-6 w-28 rounded" style={{ background: "var(--sidebar-border)" }} />
          <div className="h-3 w-20 rounded" style={{ background: "var(--sidebar-border)" }} />
        </div>
        <div className="flex-1 space-y-3 justify-center flex flex-col">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-2.5 w-14 rounded" style={{ background: "var(--sidebar-border)" }} />
              <div className="flex-1 h-2.5 rounded" style={{ background: "var(--sidebar-border)" }} />
              <div className="h-2.5 w-5 rounded" style={{ background: "var(--sidebar-border)" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const [highlights, setHighlights] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const result = await httpClient
      .get<PublicReview[]>(`/api${API_ENDPOINTS.REVIEWS.HIGHLIGHTS}?limit=12`)
      .catch(() => [] as PublicReview[]);
    setHighlights(Array.isArray(result) ? result : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const stats = useMemo(() => computeReviewStats(highlights), [highlights]);

  const featuredReview = useMemo(() => {
    if (!highlights.length) return null;
    return (
      highlights.find((r) => r.is_featured) ??
      highlights.find((r) => r.rating === 5) ??
      highlights[0]
    );
  }, [highlights]);

  const gridReviews = useMemo(
    () => (featuredReview ? highlights.filter((r) => r.id !== featuredReview.id) : highlights),
    [highlights, featuredReview]
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "var(--background)" }}>

      {/* ─────────────────────────── HERO ──────────────────────────────────── */}
      {/*
        Desktop: two-column — hero text (left) + rating summary card (right).
        Mobile:  single column, text centred.
      */}
      <section
        className="relative overflow-hidden"
        aria-label="Customer Reviews"
        style={{
          background:
            "linear-gradient(135deg, var(--sidebar-bg) 0%, var(--background) 55%, var(--sidebar-bg) 100%)",
          borderBottom: "1px solid var(--sidebar-border)",
        }}
      >
        {/* Decorative blobs */}
        <div
          className="absolute -top-28 -right-28 w-[480px] h-[480px] rounded-full opacity-[0.08] pointer-events-none"
          style={{ background: "var(--accent)" }}
          aria-hidden
        />
        <div
          className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full opacity-[0.06] pointer-events-none"
          style={{ background: "var(--primary)" }}
          aria-hidden
        />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
          <div className="lg:flex lg:items-center lg:gap-12">

            {/* ── Left: hero text ─────────────────────────────────────────── */}
            <div className="lg:flex-1 text-center sm:text-left">
              {/* Pill badge */}
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border mb-5"
                style={{
                  background: "var(--success-bg)",
                  borderColor: "var(--success-border)",
                  color: "var(--success-text)",
                }}
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                Verified Customer Reviews
              </div>

              {/* Headline */}
              <h1
                className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight mb-4"
                style={{ color: "var(--foreground)" }}
              >
                Customer{" "}
                <span style={{ color: "var(--accent)" }}>Reviews</span>
              </h1>

              {/* Subtitle */}
              <p
                className="text-lg leading-relaxed max-w-xl mx-auto sm:mx-0 mb-8"
                style={{ color: "var(--muted-foreground)" }}
              >
                See what customers say about LandarsFood — from the quality of our products
                to the full ordering experience.
              </p>

              {/* Trust pills */}
              <div className="flex flex-wrap gap-2.5 justify-center sm:justify-start">
                {TRUST_ITEMS.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
                    style={{
                      background: "var(--card-bg)",
                      borderColor: "var(--sidebar-border)",
                      color: "var(--foreground)",
                    }}
                  >
                    <Icon
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--accent)" }}
                      aria-hidden
                    />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: rating summary — desktop sidebar ──────────────────
                Hidden on mobile/tablet — shown inline in content area instead */}
            <div className="hidden lg:block w-72 xl:w-80 shrink-0">
              {loading ? <SummarySkeleton /> : <ReviewSummary stats={stats} />}
            </div>

          </div>
        </div>
      </section>

      {/* ─────────────────────── MAIN CONTENT ──────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-16">

        {/* ── Rating summary — mobile / tablet only (shown in hero on lg+) ── */}
        <div className="lg:hidden" aria-hidden={undefined}>
          {loading ? <SummarySkeleton /> : <ReviewSummary stats={stats} />}
        </div>

        {/* ── Featured review ─────────────────────────────────────────────── */}
        {loading ? (
          <div
            className="rounded-3xl border animate-pulse"
            style={{ background: "var(--card-bg)", borderColor: "var(--sidebar-border)", height: 220 }}
            aria-hidden
          />
        ) : featuredReview ? (
          <section aria-labelledby="featured-heading">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-4 h-4 shrink-0" style={{ color: "var(--accent)" }} aria-hidden />
              <h2
                id="featured-heading"
                className="text-base font-semibold"
                style={{ color: "var(--muted-foreground)" }}
              >
                Featured review
              </h2>
            </div>
            <FeaturedReview review={featuredReview} />
          </section>
        ) : null}

        {/* ── Highlighted reviews grid ────────────────────────────────────── */}
        {loading ? (
          <section aria-label="Loading reviews">
            <div
              className="h-6 w-44 rounded mb-5 animate-pulse"
              style={{ background: "var(--sidebar-border)" }}
              aria-hidden
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <ReviewCardSkeleton key={i} />
              ))}
            </div>
          </section>
        ) : gridReviews.length > 0 ? (
          <section aria-labelledby="highlights-heading">
            <div className="flex items-center gap-2.5 mb-5">
              <Star
                className="w-4 h-4 shrink-0 fill-current"
                style={{ color: "var(--accent)" }}
                aria-hidden
              />
              <h2
                id="highlights-heading"
                className="text-lg font-bold"
                style={{ color: "var(--foreground)" }}
              >
                More reviews
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {gridReviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Write a review ───────────────────────────────────────────────── */}
        <section aria-label="Share your experience">
          <ShopReviewForm onSuccess={fetchAll} />
        </section>


      </div>
    </div>
  );
}
