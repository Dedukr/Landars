/** GBP display for marketplace UI; matches shop/cart patterns. */
export function formatGbpPrice(
  value: string | number | null | undefined
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return null;
  return `£${n.toFixed(2)}`;
}
