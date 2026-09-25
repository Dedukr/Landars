import "@testing-library/jest-dom";
import fs from "fs";
import path from "path";
import vm from "vm";
import * as ts from "typescript";

/**
 * Server-side branch (no `window`): unchanged behaviour - absolute origins for SSR fetches.
 *
 * The shared jest setup needs a DOM, so instead of a `node` test environment the REAL
 * src/config/api.ts is transpiled and evaluated in a `vm` context that has no `window`.
 */
type ApiModule = { getClientApiBaseUrl: () => string };

function loadApiWithoutWindow(env: Record<string, string | undefined>): ApiModule {
  const source = fs.readFileSync(path.join(__dirname, "..", "api.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
    },
  });
  const sandboxModule = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    process: { env },
  });
  return sandboxModule.exports as unknown as ApiModule;
}

describe("getClientApiBaseUrl (server, no window)", () => {
  test("the sandbox really has no window", () => {
    expect(vm.runInNewContext("typeof window", {})).toBe("undefined");
  });

  test("uses the configured public origin (trailing slash and whitespace trimmed)", () => {
    const { getClientApiBaseUrl } = loadApiWithoutWindow({
      NEXT_PUBLIC_API_BASE_URL: "  https://landarsfood.com/ ",
    });

    expect(getClientApiBaseUrl()).toBe("https://landarsfood.com");
  });

  test("prefers the configured public origin over the internal metadata origin", () => {
    const { getClientApiBaseUrl } = loadApiWithoutWindow({
      NEXT_PUBLIC_API_BASE_URL: "https://landarsfood.com",
      METADATA_API_BASE_URL: "http://backend:8000",
    });

    expect(getClientApiBaseUrl()).toBe("https://landarsfood.com");
  });

  test("falls back to the internal metadata origin", () => {
    const { getClientApiBaseUrl } = loadApiWithoutWindow({
      METADATA_API_BASE_URL: "http://backend:8000/",
    });

    expect(getClientApiBaseUrl()).toBe("http://backend:8000");
  });

  test("falls back to https://localhost when nothing is configured", () => {
    const { getClientApiBaseUrl } = loadApiWithoutWindow({});

    expect(getClientApiBaseUrl()).toBe("https://localhost");
  });

  test("a localhost-looking configured origin is still returned as configured on the server", () => {
    const { getClientApiBaseUrl } = loadApiWithoutWindow({
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:8000",
    });

    expect(getClientApiBaseUrl()).toBe("http://localhost:8000");
  });
});
