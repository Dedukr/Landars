"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Star,
  StarOff,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { httpClient } from "@/utils/httpClient";
import { API_ENDPOINTS } from "@/config/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface AdminReview {
  id: number;
  user: number;
  user_display: string;
  user_email: string;
  product: number | null;
  product_name: string | null;
  product_slug: string | null;
  review_type: "product" | "shop";
  rating: number;
  title: string;
  comment: string;
  is_approved: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

interface ReviewsResponse {
  count: number;
  results: AdminReview[];
}

interface Filters {
  search: string;
  type: "" | "product" | "shop";
  rating: "" | "1" | "2" | "3" | "4" | "5";
  is_approved: "" | "true" | "false";
  is_featured: "" | "true" | "false";
  ordering: "-created_at" | "created_at" | "-rating" | "rating" | "-id" | "id";
}

interface EditFormData {
  rating: number;
  title: string;
  comment: string;
  is_approved: boolean;
  is_featured: boolean;
}

interface CreateFormData {
  user: string;
  product: string;
  rating: number;
  title: string;
  comment: string;
  is_approved: boolean;
  is_featured: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "product", label: "Product reviews" },
  { value: "shop", label: "Shop reviews" },
];
const RATING_OPTIONS = [
  { value: "", label: "All ratings" },
  { value: "5", label: "★★★★★ 5" },
  { value: "4", label: "★★★★☆ 4" },
  { value: "3", label: "★★★☆☆ 3" },
  { value: "2", label: "★★☆☆☆ 2" },
  { value: "1", label: "★☆☆☆☆ 1" },
];
const APPROVED_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "true", label: "Approved" },
  { value: "false", label: "Not approved" },
];
const FEATURED_OPTIONS = [
  { value: "", label: "All" },
  { value: "true", label: "Featured" },
  { value: "false", label: "Not featured" },
];
const ORDERING_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "-rating", label: "Highest rating" },
  { value: "rating", label: "Lowest rating" },
  { value: "-id", label: "ID desc" },
  { value: "id", label: "ID asc" },
];

// ── Small helper components ───────────────────────────────────────────────────

function StarDisplay({ value }: { value: number }) {
  return (
    <span className="inline-flex text-sm" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < value ? "#f59e0b" : "var(--sidebar-border)" }}>
          ★
        </span>
      ))}
    </span>
  );
}

function TypeBadge({ type }: { type: "product" | "shop" }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
      style={
        type === "product"
          ? {
              background: "rgba(99,102,241,0.1)",
              color: "#6366f1",
              borderColor: "rgba(99,102,241,0.3)",
            }
          : {
              background: "rgba(245,158,11,0.1)",
              color: "#d97706",
              borderColor: "rgba(245,158,11,0.3)",
            }
      }
    >
      {type === "product" ? "Product" : "Shop"}
    </span>
  );
}

function BoolBadge({ value, trueLabel = "Yes", falseLabel = "No" }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
      style={
        value
          ? { background: "rgba(22,163,74,0.1)", color: "#16a34a", borderColor: "rgba(22,163,74,0.3)" }
          : { background: "rgba(100,116,139,0.1)", color: "var(--muted-foreground)", borderColor: "rgba(100,116,139,0.3)" }
      }
    >
      {value ? trueLabel : falseLabel}
    </span>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({
  review,
  onConfirm,
  onCancel,
  loading,
}: {
  review: AdminReview;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--card-bg)] border border-[var(--sidebar-border)] shadow-2xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-full bg-red-100 p-2 shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">Delete review</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Delete review #{review.id} by <strong>{review.user_display}</strong>? This action cannot be
              undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} loading={loading}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Edit / Add modal ──────────────────────────────────────────────────────────

function ReviewFormModal({
  mode,
  initial,
  onSave,
  onClose,
  loading,
  errors,
}: {
  mode: "edit" | "add";
  initial: EditFormData | CreateFormData;
  onSave: (data: EditFormData | CreateFormData) => void;
  onClose: () => void;
  loading: boolean;
  errors: Record<string, string>;
}) {
  const [form, setForm] = useState<EditFormData | CreateFormData>(initial);
  const isAdd = mode === "add";

  const set = <K extends keyof (EditFormData & CreateFormData)>(
    key: K,
    value: (EditFormData & CreateFormData)[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-[var(--card-bg)] border border-[var(--sidebar-border)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--sidebar-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            {isAdd ? "Add manual review" : "Edit review"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-border)]/40 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Admin-only fields for create */}
          {isAdd && (
            <>
              <Input
                label="User ID *"
                type="number"
                placeholder="Enter customer user ID"
                value={(form as CreateFormData).user}
                onChange={(e) => set("user" as keyof (EditFormData & CreateFormData), e.target.value as never)}
                error={errors.user}
              />
              <Input
                label="Product ID (leave blank for shop review)"
                type="number"
                placeholder="Enter product ID or leave empty"
                value={(form as CreateFormData).product}
                onChange={(e) => set("product" as keyof (EditFormData & CreateFormData), e.target.value as never)}
                error={errors.product}
              />
            </>
          )}

          {/* Rating */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--foreground)]">Rating *</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => set("rating" as keyof (EditFormData & CreateFormData), star as never)}
                  className="text-2xl transition-transform hover:scale-110 focus:outline-none"
                  style={{ color: star <= form.rating ? "#f59e0b" : "var(--sidebar-border)" }}
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                >
                  ★
                </button>
              ))}
              <span className="ml-2 self-center text-sm text-[var(--muted-foreground)]">
                {form.rating}/5
              </span>
            </div>
            {errors.rating && <p className="text-xs text-[var(--destructive)]">{errors.rating}</p>}
          </div>

          {/* Title */}
          <Input
            label="Title (optional)"
            placeholder="Short headline for the review"
            value={form.title}
            onChange={(e) => set("title" as keyof (EditFormData & CreateFormData), e.target.value as never)}
            error={errors.title}
          />

          {/* Comment */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--foreground)]">
              Comment *
            </label>
            <textarea
              rows={4}
              className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-none transition-colors"
              placeholder="Review content…"
              value={form.comment}
              onChange={(e) => set("comment" as keyof (EditFormData & CreateFormData), e.target.value as never)}
            />
            {errors.comment && (
              <p className="text-xs text-[var(--destructive)]">{errors.comment}</p>
            )}
          </div>

          {/* Approved / Featured toggles */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-[var(--primary)]"
                checked={form.is_approved}
                onChange={(e) => set("is_approved" as keyof (EditFormData & CreateFormData), e.target.checked as never)}
              />
              <span className="text-sm text-[var(--foreground)]">Approved</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-[var(--primary)]"
                checked={form.is_featured}
                onChange={(e) => set("is_featured" as keyof (EditFormData & CreateFormData), e.target.checked as never)}
              />
              <span className="text-sm text-[var(--foreground)]">Featured</span>
            </label>
          </div>

          {errors.non_field_errors && (
            <p className="text-sm text-[var(--destructive)]">{errors.non_field_errors}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--sidebar-border)] px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(form)} loading={loading}>
            {isAdd ? "Add review" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({
  total,
  offset,
  limit,
  onChange,
}: {
  total: number;
  offset: number;
  limit: number;
  onChange: (offset: number) => void;
}) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between py-3 px-1">
      <p className="text-sm text-[var(--muted-foreground)]">
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={currentPage === 1}
          className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--sidebar-border)]/40 hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm px-2 text-[var(--foreground)]">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onChange(Math.min(total - limit, offset + limit))}
          disabled={currentPage === totalPages}
          className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--sidebar-border)]/40 hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminReviewsPage() {
  // Data state
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter + pagination state
  const [filters, setFilters] = useState<Filters>({
    search: "",
    type: "",
    rating: "",
    is_approved: "",
    is_featured: "",
    ordering: "-created_at",
  });
  const [offset, setOffset] = useState(0);

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Modal state
  const [editReview, setEditReview] = useState<AdminReview | null>(null);
  const [deleteReview, setDeleteReview] = useState<AdminReview | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [modalErrors, setModalErrors] = useState<Record<string, string>>({});

  // ── Fetch reviews ──────────────────────────────────────────────────────────
  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filters.type) params.set("type", filters.type);
      if (filters.rating) params.set("rating", filters.rating);
      if (filters.is_approved) params.set("is_approved", filters.is_approved);
      if (filters.is_featured) params.set("is_featured", filters.is_featured);
      params.set("ordering", filters.ordering);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));

      const res = await httpClient.get<ReviewsResponse>(
        `/api${API_ENDPOINTS.ADMIN.REVIEWS.LIST}?${params.toString()}`
      );
      setReviews(res.results);
      setTotal(res.count);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load reviews.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters, offset]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Debounce search input
  const handleSearchChange = (value: string) => {
    setFilters((f) => ({ ...f, search: value }));
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
    }, 350);
  };

  const handleFilterChange = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setOffset(0);
  };

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  const patchReview = useCallback(
    async (id: number, data: Partial<AdminReview>, successMsg: string) => {
      try {
        const updated = await httpClient.patch<AdminReview>(
          `/api${API_ENDPOINTS.ADMIN.REVIEWS.DETAIL(id)}`,
          data
        );
        setReviews((prev) => prev.map((r) => (r.id === id ? updated : r)));
        toast.success(successMsg);
      } catch {
        toast.error("Update failed. Please try again.");
      }
    },
    []
  );

  const toggleApprove = (review: AdminReview) =>
    patchReview(review.id, { is_approved: !review.is_approved }, review.is_approved ? "Review unapproved." : "Review approved.");

  const toggleFeatured = (review: AdminReview) =>
    patchReview(review.id, { is_featured: !review.is_featured }, review.is_featured ? "Removed from featured." : "Marked as featured.");

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteReview) return;
    setActionLoading(true);
    try {
      await httpClient.delete(`/api${API_ENDPOINTS.ADMIN.REVIEWS.DETAIL(deleteReview.id)}`);
      setReviews((prev) => prev.filter((r) => r.id !== deleteReview.id));
      setTotal((t) => t - 1);
      toast.success(`Review #${deleteReview.id} deleted.`);
      setDeleteReview(null);
    } catch {
      toast.error("Delete failed. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleEditSave = async (data: EditFormData | CreateFormData) => {
    if (!editReview) return;
    setActionLoading(true);
    setModalErrors({});
    try {
      const updated = await httpClient.patch<AdminReview>(
        `/api${API_ENDPOINTS.ADMIN.REVIEWS.DETAIL(editReview.id)}`,
        data
      );
      setReviews((prev) => prev.map((r) => (r.id === editReview.id ? updated : r)));
      toast.success("Review updated.");
      setEditReview(null);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const apiErr = err as { response?: { data?: Record<string, string[]> } };
        const raw = apiErr.response?.data ?? {};
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          flat[k] = Array.isArray(v) ? v.join(" ") : String(v);
        }
        setModalErrors(flat);
      } else {
        toast.error("Update failed.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleAddSave = async (data: EditFormData | CreateFormData) => {
    setActionLoading(true);
    setModalErrors({});
    const createData = data as CreateFormData;
    if (!createData.user) {
      setModalErrors({ user: "User ID is required." });
      setActionLoading(false);
      return;
    }
    try {
      const created = await httpClient.post<AdminReview>(
        `/api${API_ENDPOINTS.ADMIN.REVIEWS.LIST}`,
        {
          user: createData.user ? Number(createData.user) : undefined,
          product: createData.product ? Number(createData.product) : null,
          rating: createData.rating,
          title: createData.title,
          comment: createData.comment,
          is_approved: createData.is_approved,
          is_featured: createData.is_featured,
        }
      );
      setReviews((prev) => [created, ...prev]);
      setTotal((t) => t + 1);
      toast.success("Review created.");
      setShowAddModal(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const apiErr = err as { response?: { data?: Record<string, string[] | string> } };
        const raw = apiErr.response?.data ?? {};
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          flat[k] = Array.isArray(v) ? v.join(" ") : String(v);
        }
        setModalErrors(flat);
      } else {
        toast.error("Create failed.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <>
      {/* Modals */}
      {deleteReview && (
        <DeleteModal
          review={deleteReview}
          onConfirm={handleDelete}
          onCancel={() => setDeleteReview(null)}
          loading={actionLoading}
        />
      )}
      {editReview && (
        <ReviewFormModal
          mode="edit"
          initial={{
            rating: editReview.rating,
            title: editReview.title,
            comment: editReview.comment,
            is_approved: editReview.is_approved,
            is_featured: editReview.is_featured,
          }}
          onSave={handleEditSave}
          onClose={() => { setEditReview(null); setModalErrors({}); }}
          loading={actionLoading}
          errors={modalErrors}
        />
      )}
      {showAddModal && (
        <ReviewFormModal
          mode="add"
          initial={{ user: "", product: "", rating: 5, title: "", comment: "", is_approved: true, is_featured: false }}
          onSave={handleAddSave}
          onClose={() => { setShowAddModal(false); setModalErrors({}); }}
          loading={actionLoading}
          errors={modalErrors}
        />
      )}

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">Reviews</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {total} review{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => { setShowAddModal(true); setModalErrors({}); }}
        >
          Add review
        </Button>
      </div>

      {/* ── Filter toolbar ──────────────────────────────────────────────────── */}
      <div className="mb-4 rounded-xl border border-[var(--sidebar-border)] bg-[var(--card-bg)] p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Search comment, title, customer, product…"
              value={filters.search}
              onChange={(e) => handleSearchChange(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              rightIcon={
                filters.search ? (
                  <button onClick={() => handleSearchChange("")} className="hover:opacity-70">
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : undefined
              }
            />
          </div>

          <div className="w-40">
            <Select
              options={TYPE_OPTIONS}
              value={filters.type}
              onChange={(e) => handleFilterChange("type", e.target.value as Filters["type"])}
            />
          </div>
          <div className="w-36">
            <Select
              options={RATING_OPTIONS}
              value={filters.rating}
              onChange={(e) => handleFilterChange("rating", e.target.value as Filters["rating"])}
            />
          </div>
          <div className="w-36">
            <Select
              options={APPROVED_OPTIONS}
              value={filters.is_approved}
              onChange={(e) => handleFilterChange("is_approved", e.target.value as Filters["is_approved"])}
            />
          </div>
          <div className="w-32">
            <Select
              options={FEATURED_OPTIONS}
              value={filters.is_featured}
              onChange={(e) => handleFilterChange("is_featured", e.target.value as Filters["is_featured"])}
            />
          </div>
          <div className="w-36">
            <Select
              options={ORDERING_OPTIONS}
              value={filters.ordering}
              onChange={(e) => handleFilterChange("ordering", e.target.value as Filters["ordering"])}
            />
          </div>
          <button
            onClick={() => fetchReviews()}
            title="Refresh"
            className="flex items-center justify-center h-11 w-11 rounded-lg border border-[var(--sidebar-border)] bg-[var(--card-bg)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-border)]/40 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--card-bg)] overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
            <XCircle className="h-8 w-8 text-[var(--destructive)]" />
            <p className="text-sm font-medium text-[var(--foreground)]">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchReviews}>
              Retry
            </Button>
          </div>
        ) : loading && reviews.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">
            Loading reviews…
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">
            No reviews found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--sidebar-border)] bg-[var(--sidebar-border)]/20">
                  {["ID", "Type", "Rating", "Title", "Preview", "Customer", "Product", "Approved", "Featured", "Created", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {reviews.map((review, idx) => (
                  <tr
                    key={review.id}
                    className={[
                      "border-b border-[var(--sidebar-border)] transition-colors hover:bg-[var(--sidebar-border)]/10",
                      idx % 2 === 0 ? "" : "bg-[var(--sidebar-border)]/5",
                    ].join(" ")}
                  >
                    {/* ID */}
                    <td className="px-3 py-3 font-mono text-xs text-[var(--muted-foreground)]">
                      #{review.id}
                    </td>

                    {/* Type */}
                    <td className="px-3 py-3">
                      <TypeBadge type={review.review_type} />
                    </td>

                    {/* Rating */}
                    <td className="px-3 py-3">
                      <StarDisplay value={review.rating} />
                    </td>

                    {/* Title */}
                    <td className="px-3 py-3 max-w-[120px]">
                      <span
                        className="block truncate text-[var(--foreground)]"
                        title={review.title || "—"}
                      >
                        {review.title || <span className="text-[var(--muted-foreground)]">—</span>}
                      </span>
                    </td>

                    {/* Comment preview */}
                    <td className="px-3 py-3 max-w-[180px]">
                      <span
                        className="block truncate text-[var(--muted-foreground)] text-xs"
                        title={review.comment}
                      >
                        {review.comment ? review.comment.slice(0, 60) + (review.comment.length > 60 ? "…" : "") : "—"}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="px-3 py-3 max-w-[140px]">
                      <div className="truncate">
                        <span className="text-[var(--foreground)]">{review.user_display}</span>
                        <br />
                        <span className="text-[var(--muted-foreground)] text-xs">{review.user_email}</span>
                      </div>
                    </td>

                    {/* Product */}
                    <td className="px-3 py-3 max-w-[120px]">
                      <span
                        className="block truncate text-[var(--foreground)] text-xs"
                        title={review.product_name ?? "—"}
                      >
                        {review.product_name ?? <span className="text-[var(--muted-foreground)]">—</span>}
                      </span>
                    </td>

                    {/* Approved */}
                    <td className="px-3 py-3">
                      <BoolBadge value={review.is_approved} trueLabel="Yes" falseLabel="No" />
                    </td>

                    {/* Featured */}
                    <td className="px-3 py-3">
                      <BoolBadge value={review.is_featured} trueLabel="Yes" falseLabel="No" />
                    </td>

                    {/* Created */}
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-[var(--muted-foreground)]">
                      {formatDate(review.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {/* Edit */}
                        <button
                          onClick={() => { setEditReview(review); setModalErrors({}); }}
                          className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-border)]/40 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setDeleteReview(review)}
                          className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Approve / unapprove */}
                        <button
                          onClick={() => toggleApprove(review)}
                          className={[
                            "rounded-md p-1.5 transition-colors",
                            review.is_approved
                              ? "text-green-600 hover:bg-green-50"
                              : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-border)]/40 hover:text-green-600",
                          ].join(" ")}
                          title={review.is_approved ? "Unapprove" : "Approve"}
                        >
                          {review.is_approved ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {/* Feature / unfeature */}
                        <button
                          onClick={() => toggleFeatured(review)}
                          className={[
                            "rounded-md p-1.5 transition-colors",
                            review.is_featured
                              ? "text-amber-500 hover:bg-amber-50"
                              : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-border)]/40 hover:text-amber-500",
                          ].join(" ")}
                          title={review.is_featured ? "Remove featured" : "Mark featured"}
                        >
                          {review.is_featured ? (
                            <Star className="h-3.5 w-3.5 fill-current" />
                          ) : (
                            <StarOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ─────────────────────────────────────────────────── */}
        {!error && (
          <div className="border-t border-[var(--sidebar-border)] px-4">
            <Pagination
              total={total}
              offset={offset}
              limit={PAGE_SIZE}
              onChange={(newOffset) => setOffset(newOffset)}
            />
          </div>
        )}
      </div>
    </>
  );
}
