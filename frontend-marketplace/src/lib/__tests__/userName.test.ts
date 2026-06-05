import { formatUserDisplayName, formatUserFirstName } from "../userName";

describe("formatUserDisplayName", () => {
  it("joins first_name and surname", () => {
    expect(
      formatUserDisplayName({ first_name: "Alice", surname: "Smith", name: "" })
    ).toBe("Alice Smith");
  });

  it("falls back to legacy name", () => {
    expect(formatUserDisplayName({ name: "Bob Jones" })).toBe("Bob Jones");
  });
});

describe("formatUserFirstName", () => {
  it("uses first_name when set", () => {
    expect(formatUserFirstName({ first_name: "Alice", surname: "Smith" })).toBe(
      "Alice"
    );
  });

  it("falls back to first token of name", () => {
    expect(formatUserFirstName({ name: "Bob Jones" })).toBe("Bob");
  });
});
