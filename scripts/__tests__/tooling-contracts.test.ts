import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readToolingGraph } from "../tooling/repository-contracts.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");

describe("tooling contracts", () => {
  test("keeps root format and lint behind the shared quality runner", () => {
    const graph = readToolingGraph(repoRoot);

    expect(graph.rootScripts.format).toBe("node scripts/run-quality.mjs format");
    expect(graph.rootScripts["format:check"]).toBe("node scripts/run-quality.mjs format-check");
    expect(graph.rootScripts.lint).toBe("node scripts/run-quality.mjs lint");
    expect(graph.rootScripts["lint:fix"]).toBe("node scripts/run-quality.mjs lint-fix");
    expect(graph.rootScripts["lint:root"]).toBeUndefined();
    expect(graph.rootScripts["lint:fix:root"]).toBeUndefined();
    expect(graph.turboTasks.lint).toBeUndefined();
    expect(graph.turboTasks["lint:fix"]).toBeUndefined();
  });

  test("reads the current workspace task graph", () => {
    const graph = readToolingGraph(repoRoot);

    expect(graph.rootScripts.typecheck).toBe("turbo typecheck typecheck:root --concurrency=3");
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
    expect(graph.workspaces.find((workspace) => workspace.name === "@iam/domain")).toMatchObject({
      scripts: {
        format: "node ../../scripts/run-quality.mjs format --workspace packages/domain",
        "format:check": "node ../../scripts/run-quality.mjs format-check --workspace packages/domain",
        lint: "node ../../scripts/run-quality.mjs lint --workspace packages/domain",
        "lint:fix": "node ../../scripts/run-quality.mjs lint-fix --workspace packages/domain",
        typecheck: "pnpm exec tsc --noEmit",
      },
    });
  });

  test("keeps the TypeScript CLI and compatibility API on separate major tracks", () => {
    const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

    expect(rootManifest.devDependencies["@typescript/native"]).toMatch(/^npm:typescript@7(?:\.|$)/u);
    expect(rootManifest.devDependencies.typescript).toMatch(/^npm:@typescript\/typescript6@6(?:\.|$)/u);
  });
});
