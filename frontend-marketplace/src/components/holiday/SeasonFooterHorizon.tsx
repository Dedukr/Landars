"use client";

import { useSeason } from "@/contexts/SeasonContext";
import { WinterHorizon } from "./SeasonArt";

/** Fir-tree / gingerbread-house silhouette band above the footer (season only). */
export default function SeasonFooterHorizon() {
  const { theme } = useSeason();
  if (!theme) return null;
  return (
    <div className={`season-horizon season-horizon--${theme}`} aria-hidden="true">
      <WinterHorizon className="season-horizon-art" />
    </div>
  );
}
