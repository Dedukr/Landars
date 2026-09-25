/**
 * Client mirror of `backend/api/services/promotions.py`.
 * Only used where totals are computed locally (cart delivery/total math and the
 * "add N more" nudge) — server promo amounts always win when present.
 */

export const JERKY_PROMO_GROUP = "jerky_5_1";
export const JERKY_PROMO_GROUP_SIZE = 6;
export const JERKY_PROMO_FREE_PER_GROUP = 1;
export const JERKY_PROMO_LABEL = "Jerky 5+1";
export const JERKY_PROMO_DESCRIPTION = "Buy any 5 Jerky, get 1 free";

export interface JerkyPromoLine {
  productId: number;
  /** Unit price, already parsed from the API string. */
  price: number;
  quantity: number;
  promoGroup?: string | null;
}

export interface JerkyPromoResult {
  eligibleQuantity: number;
  freeUnits: number;
  discount: number;
  unitsToNextFree: number;
  /** Free units attributed per product id, cheapest first. */
  perProductFree: Record<number, number>;
}

function emptyResult(): JerkyPromoResult {
  return {
    eligibleQuantity: 0,
    freeUnits: 0,
    discount: 0,
    unitsToNextFree: JERKY_PROMO_GROUP_SIZE,
    perProductFree: {},
  };
}

export function isJerkyPromoProduct(promoGroup?: string | null): boolean {
  return String(promoGroup ?? "").trim() === JERKY_PROMO_GROUP;
}

function wholeUnits(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.floor(quantity);
}

export function computeJerkyPromo(lines: JerkyPromoLine[]): JerkyPromoResult {
  const byProduct = new Map<number, { price: number; units: number }>();
  for (const line of lines) {
    if (!isJerkyPromoProduct(line.promoGroup)) continue;
    if (!Number.isFinite(line.price) || line.price < 0) continue;
    const units = wholeUnits(line.quantity);
    if (units <= 0) continue;
    const existing = byProduct.get(line.productId);
    byProduct.set(
      line.productId,
      existing
        ? {
            price: Math.min(existing.price, line.price),
            units: existing.units + units,
          }
        : { price: line.price, units }
    );
  }

  if (byProduct.size === 0) return emptyResult();

  const eligible = [...byProduct.entries()].map(([productId, line]) => ({
    productId,
    ...line,
  }));
  const eligibleQuantity = eligible.reduce((sum, line) => sum + line.units, 0);
  const freeUnits =
    Math.floor(eligibleQuantity / JERKY_PROMO_GROUP_SIZE) *
    JERKY_PROMO_FREE_PER_GROUP;
  const unitsToNextFree =
    JERKY_PROMO_GROUP_SIZE - (eligibleQuantity % JERKY_PROMO_GROUP_SIZE);

  if (freeUnits === 0) {
    return {
      eligibleQuantity,
      freeUnits: 0,
      discount: 0,
      unitsToNextFree,
      perProductFree: {},
    };
  }

  const sorted = eligible.sort((a, b) => {
    const pence = Math.round(a.price * 100) - Math.round(b.price * 100);
    return pence !== 0 ? pence : a.productId - b.productId;
  });

  const perProductFree: Record<number, number> = {};
  let remaining = freeUnits;
  let discountPence = 0;

  for (const line of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, line.units);
    perProductFree[line.productId] = take;
    discountPence += Math.round(line.price * 100) * take;
    remaining -= take;
  }

  return {
    eligibleQuantity,
    freeUnits,
    discount: discountPence / 100,
    unitsToNextFree,
    perProductFree,
  };
}

/** Nudge copy for the cart summary, e.g. "Add 2 more for another free jerky". */
export function jerkyPromoNudge(unitsToNextFree: number): string | null {
  if (
    !Number.isFinite(unitsToNextFree) ||
    unitsToNextFree <= 0 ||
    unitsToNextFree >= JERKY_PROMO_GROUP_SIZE
  ) {
    return null;
  }
  return `Add ${unitsToNextFree} more for another free jerky`;
}

/** Badge copy derived from the promo definition, e.g. "5 + 1 FREE". */
export function jerkyPromoPillLabel(
  groupSize?: number | null,
  freePerGroup?: number | null
): string {
  const size =
    typeof groupSize === "number" && groupSize > 1
      ? groupSize
      : JERKY_PROMO_GROUP_SIZE;
  const free =
    typeof freePerGroup === "number" && freePerGroup > 0
      ? freePerGroup
      : JERKY_PROMO_FREE_PER_GROUP;
  return `${size - free} + ${free} FREE`;
}

/** Line label for a promo discount row, e.g. "Jerky 5+1 offer (2 free)". */
export function jerkyPromoRowLabel(
  freeUnits: number,
  label?: string | null
): string {
  const base = label?.trim() || JERKY_PROMO_LABEL;
  if (!Number.isFinite(freeUnits) || freeUnits <= 0) return `${base} offer`;
  return `${base} offer (${freeUnits} free)`;
}
