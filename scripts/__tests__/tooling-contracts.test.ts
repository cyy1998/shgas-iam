import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { readToolingGraph } from "../tooling/repository-contracts.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");

describe("tooling contracts", () => {
  test("keeps root lint scoped to executable tooling inputs", () => {
    const graph = readToolingGraph(repoRoot);

    expect(graph.rootScripts.lint).toBe("turbo lint lint:root");
    expect(graph.rootScripts["lint:root"]).toBe(
      "eslint --config eslint.root.config.mjs scripts eslint.root.config.mjs eslint.frontend.config.mjs stylelint.frontend.config.mjs",
    );
    expect(graph.rootScripts["lint:fix"]).toBe("turbo lint:fix lint:fix:root");
    expect(graph.rootScripts["lint:fix:root"]).toContain("--fix");
    expect(graph.turboTasks.lint.dependsOn).toEqual(["^lint"]);
    expect(graph.turboTasks["//#lint:root"]).toEqual({
      inputs: [
        "$TURBO_ROOT$/scripts/**",
        "$TURBO_ROOT$/eslint.root.config.mjs",
        "$TURBO_ROOT$/eslint.frontend.config.mjs",
        "$TURBO_ROOT$/stylelint.frontend.config.mjs",
        "$TURBO_ROOT$/package.json",
        "$TURBO_ROOT$/pnpm-lock.yaml",
        "$TURBO_ROOT$/packages/eslint-config/package.json",
        "$TURBO_ROOT$/packages/eslint-config/src/**",
      ],
    });
    expect(graph.turboTasks["//#lint:fix:root"]).toEqual({ cache: false });
  });

  test("reads the current workspace task graph", () => {
    const graph = readToolingGraph(repoRoot);

    expect(graph.rootScripts.typecheck).toBe("turbo typecheck --concurrency=3");
    expect(graph.globalTurboConcurrency).toBeUndefined();
    expect(graph.globalTestTimeoutOverrides).toEqual([
      "apps/admin/vitest.shared.ts: testTimeout:",
      "apps/sso/vitest.shared.ts: testTimeout:",
    ]);
    expect(graph.turboTasks.typecheck.dependsOn).toEqual(["^typecheck"]);
    for (const workspace of graph.workspaces) {
      expect(typeof workspace.scripts.lint).toBe("string");
      expect(typeof workspace.scripts["lint:fix"]).toBe("string");
    }
    expect(graph.workspaces.find(workspace => workspace.name === "@iam/domain")).toMatchObject({
      scripts: {
        lint: "eslint src eslint.config.js",
        typecheck: "pnpm exec tsc --noEmit",
      },
      eslintConfigImports: ["@iam/eslint-config"],
    });
    expect(graph.workspaces.find(workspace => workspace.name === "@iam/eslint-config")).toMatchObject({
      scripts: {
        "lint": "eslint --config ../../eslint.root.config.mjs src test",
        "lint:fix": "eslint --config ../../eslint.root.config.mjs --fix src test",
      },
    });
  });

  test("keeps the TypeScript CLI and compatibility API on separate major tracks", () => {
    const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

    expect(rootManifest.devDependencies["@typescript/native"])
      .toMatch(/^npm:typescript@7(?:\.|$)/u);
    expect(rootManifest.devDependencies.typescript)
      .toMatch(/^npm:@typescript\/typescript6@6(?:\.|$)/u);
  });
});
