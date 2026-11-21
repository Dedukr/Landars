"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { FirBranch, HollySprig, Sparkles } from "./SeasonArt";

/** Wrapping-paper ribbon on the home hero: "Christmas orders are open". */
export default function HolidayHeroBanner({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { events, theme, cartOccasion, setOccasion, rememberIntent } = useSeason();
  const [busy, setBusy] = useState(false);

  const event = events.find((e) => e.theme === theme) ?? null;
  if (!event) return null;

  const isChristmas = event.theme === "christmas";
  const alreadySet = cartOccasion?.id === event.id;

  async function start() {
    if (!event || busy) return;
    if (!user) {
      rememberIntent(event.id);
      toast.success(
        `We'll set your basket to ${event.name} when you sign in.`
      );
      router.push("/shop");
      return;
    }
    if (!alreadySet) {
      setBusy(true);
      const result = await setOccasion(event.id);
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Your basket is set to ${event.label}.`);
    }
    router.push("/shop");
  }

  return (
    <div
      className={`season-hero-ribbon season-hero-ribbon--${event.theme} ${className}`.trim()}
    >
      <span className="season-hero-ribbon-art" aria-hidden="true">
        {isChristmas ? <FirBranch /> : <Sparkles />}
      </span>
      <div className="season-hero-ribbon-text">
        <p className="season-hero-ribbon-title">
          {isChristmas
            ? "Christmas orders are open"
            : "Celebrate New Year with Landar’s"}
        </p>
        <p className="season-hero-ribbon-sub">
          {[event.delivery_window_label, `holiday rate +${event.surcharge_percent}%`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void start()}
        className="season-hero-ribbon-cta"
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : isChristmas ? (
          <HollySprig className="h-4 w-5" />
        ) : null}
        {alreadySet ? `Shop your ${event.name} order` : `Order for ${event.name}`}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
