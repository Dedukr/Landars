/**
 * HTTP routes implemented by the Django **shipping** app (`INSTALLED_APPS`: `shipping`).
 *
 * Paths stay under `/api/shipping/` for URL stability (proxies, bookmarks).
 */

export const SHIPPING_HTTP_API_BASE = "/api/shipping" as const;

/** POST → `shipping.views.get_shipping_options` (Sendcloud via `sendcloud_shipping.ShippingService`). */
export const SHIPPING_QUOTE_OPTIONS_URL = `${SHIPPING_HTTP_API_BASE}/options/` as const;
