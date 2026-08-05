import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  collectEslintDiagnosticSnapshots,
  repoRoot,
} from "./eslint-equivalence.ts";

test("preserves checked files, exit codes, and diagnostic keys", async () => {
  const baseline = JSON.parse(
    await readFile(
      resolve(repoRoot, "scripts/tooling-performance/eslint-diagnostic-baseline.json"),
      "utf8",
    ),
  );
  const actual = await collectEslintDiagnosticSnapshots();

  expect(actual).toEqual(baseline);
}, 300_000);
