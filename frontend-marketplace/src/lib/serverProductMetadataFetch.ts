/**
 * Base URL for server-side fetches that must mirror GET /api/products/:id/
 * (same JSON as the browser after Next rewrites).
 *
 * - In Docker production, set METADATA_API_BASE_URL to the backend origin, e.g. http://backend:8000
 * - In local dev, omit to use NEXT_PUBLIC_API_BASE_URL or loopback to this app (rewrites apply).
 */
export function getServerApiOriginForProductFetch(): string {
  const explicit = process.env.METADATA_API_BASE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");
  if (publicBase) return publicBase;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://127.0.0.1:3000";
}
