import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  collectEslintDiagnosticSnapshots,
  discoverEslintConsumers,
  readConsumerConfigImports,
  readWorkspaceManifest,
  repoRoot,
} from "../tooling-performance/eslint-equivalence.ts";

const ownedEslintDependencies = [
  "@antfu/eslint-config",
  "@eslint-react/eslint-plugin",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser",
  "eslint-plugin-format",
  "eslint-plugin-import-lite",
  "eslint-plugin-n",
  "eslint-plugin-react-refresh",
  "eslint-plugin-unused-imports",
];

describe("shared ESLint config migration", () => {
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

  test("keeps plugin graph ownership in @iam/eslint-config", async () => {
    const eslintConsumers = await discoverEslintConsumers();
    expect(eslintConsumers).toHaveLength(15);

    for (const consumer of eslintConsumers) {
      const manifest = await readWorkspaceManifest(consumer);
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
      };
      expect(
        ownedEslintDependencies.filter(dependency => dependency in dependencies),
        consumer.name,
      ).toEqual([]);
      expect(dependencies["@iam/eslint-config"], consumer.name).toBe("workspace:*");
      expect(await readConsumerConfigImports(consumer), consumer.name)
        .toEqual(["@iam/eslint-config"]);
    }

    const configOwnerManifest = JSON.parse(await readFile(
      resolve(repoRoot, "packages/eslint-config/package.json"),
      "utf8",
    ));
    expect(
      ownedEslintDependencies.filter(
        dependency => !(dependency in (configOwnerManifest.dependencies ?? {})),
      ),
    ).toEqual([]);
  });
});
