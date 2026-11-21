"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Truck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSeason } from "@/contexts/SeasonContext";
import type { CartHolidayFields, HolidayEvent } from "@/lib/holidayApi";
import { FirBranch, Sparkles } from "./SeasonArt";

interface OccasionPickerProps {
  /** The basket's current occasion (from /api/cart/). */
  selected: HolidayEvent | null | undefined;
  /** False when the selected holiday has been switched off since. */
  selectedOpen?: boolean;
  /** Parcel (post) baskets can't be holiday orders. */
  isPost: boolean;
  /** Called with the fresh cart after a successful change. */
  onChanged?: (cart: CartHolidayFields) => void;
  compact?: boolean;
}

const BURST_FLAKES = 14;

/**
 * "When is this order for?" — Regular / 🎄 Christmas / 🎆 New Year.
 * Customers choose the occasion only; the delivery day is assigned by us.
 */
export default function OccasionPicker({
  selected,
  selectedOpen = true,
  isPost,
  onChanged,
  compact = false,
}: OccasionPickerProps) {
  const { events, setOccasion } = useSeason();
  const [pendingId, setPendingId] = useState<number | null | undefined>(undefined);
  const [burst, setBurst] = useState<{ key: number; theme: string } | null>(null);

  useEffect(() => {
    if (!burst) return;
    const id = setTimeout(() => setBurst(null), 1400);
    return () => clearTimeout(id);
  }, [burst]);

  const selectedId = selected?.id ?? null;
  const selectedClosed = Boolean(selected) && !selectedOpen;

  // Nothing to choose and nothing to fix: stay out of the way.
  if (events.length === 0 && !selected) return null;

  async function choose(eventId: number | null) {
    if (eventId === selectedId || pendingId !== undefined) return;
    setPendingId(eventId);
    const result = await setOccasion(eventId);
    setPendingId(undefined);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const event = events.find((e) => e.id === eventId);
    if (event) setBurst({ key: Date.now(), theme: event.theme });
    onChanged?.(result.cart);
  }

  if (selectedClosed) {
    return (
      <div className="season-occasion-alert" role="alert">
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{selected?.name} orders are now closed.</p>
          <p className="text-sm opacity-80">
            Switch to regular delivery to place your order.
          </p>
        </div>
        <button
          type="button"
          className="season-occasion-alert-btn"
          onClick={() => void choose(null)}
          disabled={pendingId !== undefined}
        >
          Switch to regular
        </button>
      </div>
    );
  }

  return (
    <section
      className={`season-occasion${compact ? " season-occasion--compact" : ""}`}
      aria-labelledby="season-occasion-title"
    >
      <div className="season-occasion-head">
        <h2 id="season-occasion-title" className="season-occasion-title">
          When is this order for?
        </h2>
        {!compact && (
          <p className="season-occasion-sub">
            Ordering for the holidays? Pick it here — we&apos;ll confirm your
            delivery day.
          </p>
        )}
      </div>

      <div
        role="radiogroup"
        aria-labelledby="season-occasion-title"
        className="season-occasion-grid"
      >
        <OccasionCard
          checked={selectedId === null}
          pending={pendingId === null}
          onSelect={() => void choose(null)}
          className="season-card--regular"
          title="Regular delivery"
          note="Our usual delivery schedule"
          art={<Truck className="season-card-icon" aria-hidden="true" />}
          compact={compact}
        />
        {events.map((event) => (
          <OccasionCard
            key={event.id}
            checked={selectedId === event.id}
            pending={pendingId === event.id}
            disabled={isPost}
            onSelect={() => void choose(event.id)}
            className={`season-card--${event.theme}`}
            title={event.label}
            note={event.delivery_window_label}
            rate={`+${event.surcharge_percent}% holiday rate`}
            art={
              event.theme === "christmas" ? (
                <FirBranch className="season-card-art" />
              ) : (
                <Sparkles className="season-card-art" />
              )
            }
            compact={compact}
          />
        ))}
      </div>

      {isPost && events.length > 0 && (
        <p className="season-occasion-note">
          Holiday delivery isn&apos;t available for parcel (post) orders.
        </p>
      )}

      {burst && (
        <span
          key={burst.key}
          className={`season-burst season-burst--${burst.theme}`}
          aria-hidden="true"
        >
          {Array.from({ length: BURST_FLAKES }).map((_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                animationDelay: `${(i % 5) * 0.06}s`,
              }}
            />
          ))}
        </span>
      )}
    </section>
  );
}

function OccasionCard({
  checked,
  pending,
  disabled = false,
  onSelect,
  className,
  title,
  note,
  rate,
  art,
  compact,
}: {
  checked: boolean;
  pending: boolean;
  disabled?: boolean;
  onSelect: () => void;
  className: string;
  title: string;
  note?: string;
  rate?: string;
  art: ReactNode;
  compact: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={[title, note, rate].filter(Boolean).join(", ")}
      disabled={disabled}
      onClick={onSelect}
      className={`season-card ${className}${checked ? " is-checked" : ""}`}
    >
      {!compact && <span className="season-card-art-wrap">{art}</span>}
      <span className="season-card-body">
        <span className="season-card-title">
          {title}
          {pending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Updating" />
          )}
        </span>
        {note && <span className="season-card-note">{note}</span>}
        {rate && <span className="season-card-rate">{rate}</span>}
      </span>
      <span className="season-card-check" aria-hidden="true" />
    </button>
  );
}
