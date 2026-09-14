/**
 * Latin-script validation for names and address fields (matches backend).
 * Only letters are constrained to Latin script; punctuation and symbols
 * (including typographic marks from mobile keyboards) are allowed.
 * Rejects Cyrillic and other non-Latin letters; accented Latin (José) is allowed.
 */

export const LATIN_SCRIPT_ERROR = "Use Latin characters only";

export function isLatinScriptText(value: string | null | undefined): boolean {
  const text = value ?? "";
  if (!text.trim()) {
    return true;
  }

  for (const ch of text) {
    // Only alphabetic characters are constrained to Latin script.
    // Punctuation / symbols (curly apostrophes, dashes, £, etc.) pass.
    if (!/\p{L}/u.test(ch)) {
      continue;
    }
    if (!/\p{Script=Latin}/u.test(ch)) {
      return false;
    }
  }
  return true;
}

export function latinScriptError(
  value: string | null | undefined
): string | null {
  return isLatinScriptText(value) ? null : LATIN_SCRIPT_ERROR;
}

/** Add Latin-script errors for non-empty fields that are not already in `errors`. */
export function applyLatinScriptErrors(
  fields: Record<string, string | null | undefined>,
  errors: Record<string, string>
): void {
  for (const [key, value] of Object.entries(fields)) {
    if (errors[key]) {
      continue;
    }
    const message = latinScriptError(value);
    if (message) {
      errors[key] = message;
    }
  }
}
