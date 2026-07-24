import { describe, expect, test } from "bun:test";
import {
  createBackendConfig,
  createFrontendConfig,
  createRootConfig,
  createServiceBackendConfig,
} from "../src/index.ts";

describe("shared ESLint presets", () => {
  test("keeps the backend formatting and max-length contract", async () => {
    const config = await createBackendConfig();
    const rules = mergedRules(config);

    expect(rules["max-len"]).toEqual([
      "warn",
      {
        code: 120,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
        ignoreUrls: true,
      },
    ]);
    expect(rules["style/semi"]).toBeDefined();
  });

  test("adds service-specific Node and console exceptions", async () => {
    const rules = mergedRules(await createServiceBackendConfig());

    expect(rules).toMatchObject({
      "no-console": "warn",
      "node/prefer-global/process": "off",
      "node/prefer-global/buffer": "off",
      "ts/consistent-type-definitions": "off",
    });
  });

  test("keeps frontend formatting outside ESLint", async () => {
    const config = await createFrontendConfig();

    expect(config.some(entry =>
      entry.rules?.["import/consistent-type-specifier-style"] === "off"
      && entry.rules?.["perfectionist/sort-imports"] === "off"
      && entry.rules?.["react-refresh/only-export-components"] === "warn",
    )).toBe(true);
    expect(config.some(entry => entry.name?.startsWith("antfu/formatter/"))).toBe(false);
  });

  test("allows package-local rules without replacing shared rules", async () => {
    const rules = mergedRules(await createRootConfig({
      rules: {
        "no-template-curly-in-string": "off",
      },
    }));

    expect(rules["max-len"]).toBeDefined();
    expect(rules["no-template-curly-in-string"]).toBe("off");
  });
});

function mergedRules(config) {
  return Object.assign({}, ...config.map(entry => entry.rules ?? {}));
}
