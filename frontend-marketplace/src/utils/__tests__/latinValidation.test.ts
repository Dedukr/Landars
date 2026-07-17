import {
  applyLatinScriptErrors,
  isLatinScriptText,
  LATIN_SCRIPT_ERROR,
  latinScriptError,
} from "../latinValidation";

describe("latinValidation", () => {
  it("accepts ASCII and accented Latin", () => {
    expect(isLatinScriptText("José García")).toBe(true);
    expect(isLatinScriptText("Müller")).toBe(true);
    expect(isLatinScriptText("10 High Street, Flat 2")).toBe(true);
    expect(isLatinScriptText("SW1A 1AA")).toBe(true);
    expect(isLatinScriptText("")).toBe(true);
  });

  it("rejects Cyrillic", () => {
    expect(isLatinScriptText("Юлія")).toBe(false);
    expect(latinScriptError("Київ")).toBe(LATIN_SCRIPT_ERROR);
  });

  it("applies errors only to non-empty invalid fields", () => {
    const errors: Record<string, string> = {
      first_name: "First name is required",
    };
    applyLatinScriptErrors(
      {
        first_name: "Юлія",
        surname: "Nova",
        city: "Київ",
        address_line: "",
      },
      errors
    );
    expect(errors.first_name).toBe("First name is required");
    expect(errors.city).toBe(LATIN_SCRIPT_ERROR);
    expect(errors.surname).toBeUndefined();
    expect(errors.address_line).toBeUndefined();
  });
});
