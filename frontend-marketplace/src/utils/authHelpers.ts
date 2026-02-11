/**
 * Only allow relative paths on our site (no protocol, no //, no external hosts).
 */
export function getSafeNextRedirect(next: string | null): string | null {
  if (!next || typeof next !== "string") return null;
  const decoded = decodeURIComponent(next.trim());
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
  return decoded;
}

/**
 * Build auth page URL with optional return path (next).
 */
export function getAuthUrl(options: {
  mode?: "signin" | "signup";
  next?: string | null;
}): string {
  const params = new URLSearchParams();
  if (options.mode) params.set("mode", options.mode);
  if (options.next && getSafeNextRedirect(options.next)) {
    params.set("next", options.next);
  }
  const q = params.toString();
  return q ? `/auth?${q}` : "/auth";
}
