import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

describe("Full-system Docker build context", () => {
  test("excludes nested local environment overrides from every app image", async () => {
    const dockerIgnore = await readFile(
      new URL("../../../.dockerignore", import.meta.url),
      "utf8",
    );
    const patterns = new Set(
      dockerIgnore
        .split(/\r?\n/gu)
        .map(line => line.trim())
        .filter(line => line !== "" && !line.startsWith("#")),
    );

    const requiredPatterns = [
      "**/.env.local",
      "**/.env.development.local",
      "**/.env.test.local",
      "**/.env.production.local",
    ];
    for (const pattern of requiredPatterns)
      expect(patterns.has(pattern)).toBe(true);
  });
});
