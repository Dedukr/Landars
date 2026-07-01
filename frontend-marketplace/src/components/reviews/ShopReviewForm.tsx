"use client";

/**
 * ShopReviewForm
 * A self-contained, auth-aware component for submitting a general shop review.
 *
 * States handled:
 *  1. Loading  – fetching eligibility
 *  2. Anonymous – prompt to sign in
 *  3. Logged in, no orders – explain why they can't review
 *  4. Logged in, already reviewed – thank-you card with their review
 *  5. Eligible – full form with interactive stars, title, comment
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CheckCircle2,
  ShoppingBag,
  LogIn,
  Send,
  Star,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import AlertMessage from "@/components/AlertMessage";
import LoadingSpinner from "@/components/LoadingSpinner";
import { StarPicker, StarDisplay } from "./StarRating";
import type { ReviewMeStatus } from "./types";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import { httpClient } from "@/utils/httpClient";
import { API_ENDPOINTS } from "@/config/api";
import { formatReviewDate } from "./ReviewCard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopReviewFormProps {
  /** Called after a successful submission so parent can refresh the review list */
  onSuccess?: () => void;
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  rating: number;
  title: string;
  comment: string;
}

/** String-keyed errors shown alongside form fields */
interface FormErrors {
  rating?: string;
  title?: string;
  comment?: string;
}

const EMPTY_FORM: FormState = { rating: 0, title: "", comment: "" };

// ── Main component ────────────────────────────────────────────────────────────

export default function ShopReviewForm({ onSuccess }: ShopReviewFormProps) {
  const { user, loading: authLoading } = useAuth();

  const [status, setStatus] = useState<ReviewMeStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Fetch eligibility status whenever the user changes
  const fetchStatus = useCallback(async () => {
    if (!user) return;
    setStatusLoading(true);
    setStatusError(null);
    try {
      const data = await httpClient.get<ReviewMeStatus>(
        `/api${API_ENDPOINTS.REVIEWS.SHOP_ME}`
      );
      setStatus(data);
    } catch {
      setStatusError("Could not load your review status. Please refresh.");
    } finally {
      setStatusLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.rating) errs.rating = "Please select a star rating.";
    if (!form.comment.trim()) errs.comment = "Please write a short review.";
    else if (form.comment.trim().length < 10)
      errs.comment = "Comment must be at least 10 characters.";
    else if (form.comment.trim().length > 2000)
      errs.comment = "Comment must be 2000 characters or fewer.";
    if (form.title && form.title.length > 200)
      errs.title = "Title must be 200 characters or fewer.";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await httpClient.post(`/api${API_ENDPOINTS.REVIEWS.SHOP}`, {
        rating: form.rating,
        title: form.title.trim() || undefined,
        comment: form.comment.trim(),
      });
      toast.success("Thank you. Your review has been submitted successfully.");
      setForm(EMPTY_FORM);
      setFormErrors({});
      await fetchStatus();
      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";

      // Parse DRF field-level errors if available
      if (msg.startsWith("{")) {
        try {
          const parsed: Record<string, string[]> = JSON.parse(msg);
          const newErrs: FormErrors = {};
          if (parsed.rating) newErrs.rating = parsed.rating[0];
          if (parsed.comment) newErrs.comment = parsed.comment[0];
          if (parsed.title) newErrs.title = parsed.title[0];
          setFormErrors(newErrs);
          return;
        } catch {
          // fall through
        }
      }
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading states ──────────────────────────────────────────────────────────

  if (authLoading) {
    return <LoadingSpinner size="sm" text="Loading…" className="min-h-[100px]" />;
  }

  // ── State 2: anonymous ──────────────────────────────────────────────────────

  if (!user) {
    return (
      <div
        className="rounded-2xl border p-8 sm:p-10 flex flex-col items-center text-center gap-5"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(217,164,65,0.1)" }}
        >
          <Star className="w-8 h-8" style={{ color: "var(--accent)" }} aria-hidden />
        </div>
        <div className="max-w-sm">
          <h3 className="text-xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
            Share your experience
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            Sign in to leave a review. Your feedback helps us improve and helps
            other customers choose with confidence.
          </p>
        </div>
        <Link
          href={getAuthUrl({ mode: "signin", next: "/reviews" })}
          className="block w-full sm:w-auto"
        >
          <Button
            icon={<LogIn className="w-4 h-4" />}
            variant="primary"
            size="lg"
            fullWidth
            className="sm:w-auto"
          >
            Sign in to review
          </Button>
        </Link>
      </div>
    );
  }

  // ── Eligibility loading ─────────────────────────────────────────────────────

  if (statusLoading) {
    return <LoadingSpinner size="sm" text="Checking eligibility…" className="min-h-[120px]" />;
  }

  if (statusError) {
    return (
      <div className="space-y-3">
        <AlertMessage variant="error">{statusError}</AlertMessage>
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={fetchStatus}
        >
          Try again
        </Button>
      </div>
    );
  }

  // ── State 3: no orders ──────────────────────────────────────────────────────

  if (status && !status.has_order) {
    return (
      <div
        className="rounded-2xl border p-8 sm:p-10 flex flex-col items-center text-center gap-5"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--sidebar-bg)" }}
        >
          <ShoppingBag className="w-8 h-8" style={{ color: "var(--muted-foreground)" }} aria-hidden />
        </div>
        <div className="max-w-sm">
          <h3 className="text-xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
            Place an order first
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            You can leave a shop review after placing your first order.
            We&apos;d love to hear what you think once you&apos;ve tried our food!
          </p>
        </div>
        <Link href="/shop" className="block w-full sm:w-auto">
          <Button
            variant="primary"
            icon={<ShoppingBag className="w-4 h-4" />}
            size="lg"
            fullWidth
            className="sm:w-auto"
          >
            Explore our menu
          </Button>
        </Link>
      </div>
    );
  }

  // ── State 4: already reviewed ───────────────────────────────────────────────

  if (status?.has_existing_review && status.review) {
    const r = status.review;
    return (
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        {/* Success banner */}
        <div
          className="px-6 sm:px-8 py-5 flex items-start gap-4 border-b"
          style={{
            background: "var(--success-bg)",
            borderColor: "var(--success-border)",
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: "var(--success-border)" }}
          >
            <CheckCircle2 className="w-5 h-5" style={{ color: "var(--success-text)" }} aria-hidden />
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: "var(--success-text)" }}>
              Thank you for your feedback.
            </p>
            <p className="text-sm mt-0.5" style={{ color: "var(--success-text)", opacity: 0.8 }}>
              Your review helps other customers understand what to expect from LandarsFood.
            </p>
          </div>
        </div>

        {/* Their review preview */}
        <div className="px-6 sm:px-8 py-6 space-y-3">
          <div className="flex items-center gap-3">
            <StarDisplay value={r.rating} size="sm" />
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Submitted {formatReviewDate(r.created_at)}
            </span>
          </div>
          {r.title && (
            <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
              {r.title}
            </p>
          )}
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            {r.comment}
          </p>
          <p className="text-xs pt-2" style={{ color: "var(--muted-foreground)" }}>
            You&apos;ve already submitted a shop review. Contact us if you need to make changes.
          </p>
        </div>
      </div>
    );
  }

  // ── State 5: eligible — full form ───────────────────────────────────────────

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Form header */}
      <div
        className="px-6 sm:px-8 pt-6 sm:pt-8 pb-5 border-b"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <h3 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
          Share your experience
        </h3>
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
          Tell us how your order experience was. Your feedback helps us improve and helps
          other customers choose with confidence.
        </p>
      </div>

      <div className="px-6 sm:px-8 py-6 sm:py-8 space-y-6">
        {/* Rating */}
        <div className="space-y-2">
          <label className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Overall rating <span style={{ color: "var(--destructive)" }}>*</span>
          </label>
          <StarPicker
            value={form.rating}
            onChange={(v) => {
              setForm((p) => ({ ...p, rating: v }));
              if (formErrors.rating) setFormErrors((p) => ({ ...p, rating: undefined }));
            }}
            size="xl"
          />
          {formErrors.rating && (
            <p className="text-xs" style={{ color: "var(--destructive)" }}>
              {formErrors.rating}
            </p>
          )}
        </div>

        {/* Optional title */}
        <Input
          label="Title (optional)"
          placeholder="e.g. Incredibly fresh, fast delivery"
          value={form.title}
          onChange={(e) => {
            setForm((p) => ({ ...p, title: e.target.value }));
            if (formErrors.title) setFormErrors((p) => ({ ...p, title: undefined }));
          }}
          error={formErrors.title}
          fullWidth
          maxLength={200}
        />

        {/* Comment */}
        <div className="space-y-1">
          <Textarea
            label="Your review"
            placeholder="What did you enjoy? How was the food quality, packaging, or delivery experience?"
            value={form.comment}
            onChange={(e) => {
              setForm((p) => ({ ...p, comment: e.target.value }));
              if (formErrors.comment) setFormErrors((p) => ({ ...p, comment: undefined }));
            }}
            error={formErrors.comment}
            fullWidth
            rows={5}
            maxLength={2000}
          />
          <p className="text-xs text-right" style={{ color: "var(--muted-foreground)" }}>
            {form.comment.length} / 2000
          </p>
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          icon={<Send className="w-4 h-4" />}
          fullWidth
          size="lg"
        >
          {submitting ? "Submitting…" : "Post your review"}
        </Button>
      </div>
    </form>
  );
}
