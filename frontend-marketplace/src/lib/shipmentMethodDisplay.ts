/**
 * Parse Sendcloud / Royal Mail-style method names for UI (tracked vs not, 24h vs 48h).
 */

export type ShipmentMethodDisplay = {
  /** e.g. "Tracked · 48h", "Not tracked", or a cleaned fallback */
  headline: string;
  /** Parcel tier / remainder (e.g. "Medium Parcel 0-5kg") */
  subtitle: string;
};

function tidyDetail(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—]+|[\s\-–—]+$/g, "")
    .trim();
}

/**
 * Derive a short headline (tracked + service hours) and a subtitle (parcel type / band).
 */
export function parseShipmentMethodName(serviceName: string): ShipmentMethodDisplay {
  const raw = (serviceName || "").trim();
  if (!raw) {
    return { headline: "", subtitle: "" };
  }

  if (/\b(untracked|non[-\s]?tracked)\b/i.test(raw)) {
    let sub = raw
      .replace(/Royal Mail/gi, "")
      .replace(/\b(untracked|non[-\s]?tracked)\b/gi, "")
      .replace(/\s+/g, " ");
    sub = tidyDetail(sub);
    return { headline: "Not tracked", subtitle: sub };
  }

  let speed: "48" | "24" | null = null;
  if (/\btracked\s*48\b/i.test(raw)) {
    speed = "48";
  } else if (/\btracked\s*24\b/i.test(raw)) {
    speed = "24";
  }

  const hasTrackedWord = /\btracked\b/i.test(raw);
  let headline: string;
  if (speed) {
    headline = `Tracked · ${speed}h`;
  } else if (hasTrackedWord) {
    headline = "Tracked";
  } else {
    headline = tidyDetail(raw.replace(/^Royal Mail\s+/i, "")) || raw;
  }

  let subtitle = raw
    .replace(/Royal Mail/gi, "")
    .replace(/Tracked\s*48/gi, "")
    .replace(/Tracked\s*24/gi, "")
    .replace(/\btracked\b/gi, "");
  subtitle = tidyDetail(subtitle);

  return { headline, subtitle };
}
