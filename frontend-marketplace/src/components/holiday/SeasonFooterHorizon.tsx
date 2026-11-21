"use client";

import { useSeason } from "@/contexts/SeasonContext";
import { seasonGreeting } from "@/lib/holidayApi";
import { Ornament, WinterHorizon } from "./SeasonArt";

/** Paper-cut winter valley above the footer, with the season's greeting (season only). */
export default function SeasonFooterHorizon() {
  const { theme } = useSeason();
  if (!theme) return null;
  return (
    <div className={`season-horizon season-horizon--${theme}`}>
      <WinterHorizon className="season-horizon-art" />
      <p className="season-greeting">
        <Ornament className="season-greeting-rule" />
        {seasonGreeting(theme)}
        <Ornament className="season-greeting-rule" />
      </p>
    </div>
  );
}
