/**
 * Only allow relative paths on our site (no protocol, no //, no external hosts).
 * Rejects auth/recovery pages so login never loops back onto itself.
 */
export function getSafeNextRedirect(next: string | null): string | null {
  if (!next || typeof next !== "string") return null;
  try {
    let decoded = decodeURIComponent(next.trim());
    // Tolerate accidental double-encoding from nested links
    if (decoded.includes("%2F") || decoded.includes("%2f")) {
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        /* keep first decode */
      }
    }

    if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;

    const pathOnly =
      decoded.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
    const blocked = ["/auth", "/verify-email", "/reset-password"];
    if (blocked.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
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
  const safeNext = getSafeNextRedirect(options.next ?? null);
  if (safeNext) {
    params.set("next", safeNext);
  }
  const q = params.toString();
  return q ? `/auth?${q}` : "/auth";
}
