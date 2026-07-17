/**
 * Latin-script validation for names and address fields (matches backend).
 * Rejects Cyrillic and other non-Latin letters; accented Latin (José) is allowed.
 */

export const LATIN_SCRIPT_ERROR = "Use Latin characters only";

export function isLatinScriptText(value: string | null | undefined): boolean {
  const text = value ?? "";
  if (!text.trim()) {
    return true;
  }

  for (const ch of text) {
    if (/\s/u.test(ch) || /\d/u.test(ch)) {
      continue;
    }
    if (/\p{L}/u.test(ch)) {
      if (!/\p{Script=Latin}/u.test(ch)) {
        return false;
      }
      continue;
    }
    // Allow ASCII punctuation / symbols used in names and addresses.
    if ((ch.codePointAt(0) ?? 0) < 128) {
      continue;
    }
    return false;
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
