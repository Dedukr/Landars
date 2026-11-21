import { getClientApiBaseUrl } from "@/config/api";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";

export type HolidayTheme = "christmas" | "new_year";

/** A holiday customers can order for (Christmas, New Year). Mirrors the API. */
export interface HolidayEvent {
  id: number;
  name: string;
  theme: HolidayTheme;
  emoji: string;
  label: string;
  /** Percent, as a decimal string (e.g. "15"). */
  surcharge_percent: string;
  delivery_window_label: string;
}

/** Holiday fields the cart API returns alongside the usual cart data. */
export interface CartHolidayFields {
  holiday_event?: HolidayEvent | null;
  holiday_event_open?: boolean;
  holiday_fee_percent?: string;
  holiday_fee_amount?: string;
  is_home_delivery?: boolean;
}

export const HOLIDAY_UNAVAILABLE_CODE = "holiday_unavailable";

const EVENTS_FETCH_TIMEOUT_MS = 8_000;

/** Open holidays; [] on any failure so the storefront simply stays regular. */
export async function fetchHolidayEvents(): Promise<HolidayEvent[]> {
  try {
    const response = await fetchWithTimeout(
      `${getClientApiBaseUrl()}/api/holiday-events/`,
      {
        method: "GET",
        credentials: "omit",
        headers: { Accept: "application/json" },
      },
      EVENTS_FETCH_TIMEOUT_MS
    );
    if (!response.ok) return [];
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as HolidayEvent[]) : [];
  } catch {
    return [];
  }
}

/** Christmas wins while it is on; otherwise New Year; otherwise no season. */
export function pickSeasonTheme(events: HolidayEvent[]): HolidayTheme | null {
  if (events.some((e) => e.theme === "christmas")) return "christmas";
  if (events.some((e) => e.theme === "new_year")) return "new_year";
  return null;
}

export function percentOf(event: HolidayEvent | null | undefined): number {
  const n = parseFloat(event?.surcharge_percent ?? "0");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round pence half-to-even, like Python's Decimal rounding on the server. */
function roundPenceHalfEven(pence: number): number {
  const fixed = Math.round(pence * 1e6) / 1e6; // shed float noise (e.g. 449.99999)
  const floor = Math.floor(fixed);
  const diff = fixed - floor;
  if (Math.abs(diff - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(fixed);
}

/** Holiday rate on an items subtotal (same formula and rounding as the server). */
export function holidayFeeAmount(subtotal: number, percent: number): number {
  if (!(subtotal > 0) || !(percent > 0)) return 0;
  return roundPenceHalfEven(subtotal * percent) / 100;
}

/** Unit price with the holiday rate, rounded to pence. */
export function holidayUnitPrice(price: number, percent: number): number {
  return roundPenceHalfEven(price * (100 + percent)) / 100;
}

export function seasonGreeting(theme: HolidayTheme): string {
  return theme === "christmas" ? "Merry Christmas" : "Happy New Year";
}
