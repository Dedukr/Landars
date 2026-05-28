/** Business support phone from env (`NEXT_PUBLIC_SUPPORT_PHONE`). */
export function getSupportPhone(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() ?? "";
}

/** Digits only — required for `wa.me` / WhatsApp API links. */
export function getWhatsAppDigits(phone?: string): string {
  return (phone ?? getSupportPhone()).replace(/\D/g, "");
}

/** WhatsApp chat link for the business number, or null if not configured. */
export function getWhatsAppHref(phone?: string): string | null {
  const digits = getWhatsAppDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}
