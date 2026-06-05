/** Display name from API user fields (supports legacy `name` only). */
export function formatUserDisplayName(user: {
  name?: string | null;
  first_name?: string | null;
  surname?: string | null;
}): string {
  const parts = [user.first_name, user.surname]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return (user.name ?? "").trim();
}

/** First name for greetings; falls back to first token of display name. */
export function formatUserFirstName(user: {
  name?: string | null;
  first_name?: string | null;
  surname?: string | null;
}): string {
  const first = (user.first_name ?? "").trim();
  if (first) return first;
  const display = formatUserDisplayName(user);
  return display.split(/\s+/)[0] ?? "";
}
