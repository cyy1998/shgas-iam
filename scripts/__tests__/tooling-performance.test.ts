import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  buildInterleavedPlan,
  parseArgs,
  parseLintDiagnostics,
  parseLintMeasurement,
  profileCompileCacheDirectory,
  runBenchmark,
  summarize,
} from "../benchmark-eslint-config.mjs";
import { readToolingGraph } from "../tooling-performance/repository-contracts.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const requireFromRepo = createRequire(join(repoRoot, "package.json"));

describe("tooling performance contracts", () => {
  test("requires at least five rounds", () => {
    expect(() => parseArgs(["--rounds", "4"])).toThrow("--rounds must be an integer of at least 5");
    expect(parseArgs(["--rounds", "5", "--config-only"]).rounds).toBe(5);
  });

  test("rotates profile order between rounds", () => {
    expect(buildInterleavedPlan(["backend", "frontend"], 5)).toEqual([
      ["backend", "frontend"],
      ["frontend", "backend"],
      ["backend", "frontend"],
      ["frontend", "backend"],
      ["backend", "frontend"],
    ]);
  });

  test("isolates compile caches by profile and measurement phase", () => {
    expect(profileCompileCacheDirectory("/tmp/eslint-cache", "current-backend", "config"))
      .toBe("/tmp/eslint-cache/current-backend/config");
    expect(profileCompileCacheDirectory("/tmp/eslint-cache", "current-backend", "first-file-lint"))
      .toBe("/tmp/eslint-cache/current-backend/first-file-lint");
    expect(profileCompileCacheDirectory("/tmp/eslint-cache", "current-backend", "workspace-lint"))
      .toBe("/tmp/eslint-cache/current-backend/workspace-lint");
    expect(profileCompileCacheDirectory("/tmp/eslint-cache", "current-frontend", "config"))
      .toBe("/tmp/eslint-cache/current-frontend/config");
  });

  test("reports stable distribution fields", () => {
    expect(summarize([
      { wallMs: 5 },
      { wallMs: 1 },
      { wallMs: 3 },
      { wallMs: 4 },
      { wallMs: 2 },
    ], "wallMs")).toEqual({
      min: 1,
      median: 3,
      p95: 5,
      max: 5,
    });
  });

  test("normalizes ESLint diagnostics for equivalence checks", () => {
    expect(parseLintDiagnostics(JSON.stringify([
      {
        filePath: "example.ts",
        messages: [
          { severity: 2, ruleId: "no-debugger" },
          { severity: 1, ruleId: "max-len" },
          { severity: 1, ruleId: "max-len" },
        ],
      },
    ]))).toEqual({
      fileCount: 1,
      errorCount: 1,
      warningCount: 2,
      ruleIds: ["max-len", "no-debugger"],
    });
    expect(parseLintDiagnostics("not json")).toBeNull();
  });

  test("propagates failed or malformed ESLint measurements", () => {
    expect(() => parseLintMeasurement("current-backend", "workspace-lint", {
      exitCode: 1,
      stdout: "[]",
      stderr: "lint failed",
    }, 10)).toThrow("ESLint workspace-lint failed for current-backend with exit code 1");

    expect(() => parseLintMeasurement("current-backend", "workspace-lint", {
      exitCode: 0,
      stdout: "not json",
      stderr: "",
    }, 10)).toThrow("ESLint workspace-lint returned invalid JSON for current-backend");

    expect(parseLintMeasurement("current-backend", "first-file-lint", {
      exitCode: 0,
      stdout: "[]",
      stderr: "__IAM_METRICS__1.25 2.50 0.25 123456\n",
    }, 1300)).toMatchObject({
      exitCode: 0,
      measuredWallMs: 1250,
      userCpuMs: 2500,
      systemCpuMs: 250,
      maxRssKiB: 123456,
      diagnostics: {
        fileCount: 0,
        errorCount: 0,
        warningCount: 0,
      },
    });
  });

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
    expect(graph.globalTestTimeoutOverrides).toEqual([]);
    expect(graph.turboTasks.typecheck.dependsOn).toEqual(["^typecheck"]);
    expect(graph.workspaces).toHaveLength(15);
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
        "lint": "eslint --config ../../eslint.root.config.mjs src test benchmark",
        "lint:fix": "eslint --config ../../eslint.root.config.mjs --fix src test benchmark",
      },
    });

    const oidcEntrySmoke = readFileSync(
      join(repoRoot, "apps", "oidc-provider", "src", "__tests__", "entry.smoke.test.ts"),
      "utf8",
    );
    expect(oidcEntrySmoke).toContain("const entryReadyTimeoutMs = 15_000;");
    expect(oidcEntrySmoke).toContain("const entrySmokeTimeoutMs = 25_000;");
    expect(oidcEntrySmoke.match(/\bentryReadyTimeoutMs\b/gu)).toHaveLength(2);
    expect(oidcEntrySmoke.match(/\bentrySmokeTimeoutMs\b/gu)).toHaveLength(2);
    expect(oidcEntrySmoke).toContain("      entryReadyTimeoutMs,\n    );");
    expect(oidcEntrySmoke).toContain("  }, entrySmokeTimeoutMs);");
  });

  test("keeps the TypeScript CLI and compatibility API on their pinned tracks", () => {
    const compatibilityWrapper = requireFromRepo("typescript/package.json");
    const compatibilityApi = requireFromRepo("typescript");
    const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

    expect(rootManifest.devDependencies["@typescript/native"]).toBe("npm:typescript@7.0.2");
    expect(compatibilityWrapper).toMatchObject({
      name: "@typescript/typescript6",
      version: "6.0.2",
    });
    expect(compatibilityApi.version).toBe("6.0.2");
  });

  test("keeps reproducible baseline metadata", () => {
    const baseline = JSON.parse(readFileSync(
      join(repoRoot, "scripts", "tooling-performance", "baseline.json"),
      "utf8",
    ));

    expect(baseline).toMatchObject({
      schemaVersion: 1,
      targetBase: "55c25384e82fca2935dec782e4dd270090a9d5dc",
      machine: {
        logicalCpuCount: 18,
        memoryGiB: 15,
      },
    });
    expect(baseline.commands.eslintConfig).toContain("--rounds 5");
  });

  test("separates first observations from warm summaries", async () => {
    const result = await runBenchmark(parseArgs([
      "--profile",
      "current-backend",
      "--rounds",
      "5",
      "--config-only",
    ]));

    expect(result.samples.map(sample => sample.cacheState)).toEqual([
      {
        processStart: "fresh",
        filesystemCache: "uncontrolled-first-observation",
        nodeCompileCache: "disabled",
      },
      ...Array.from({ length: 4 }, () => ({
        processStart: "fresh",
        filesystemCache: "warm-observation",
        nodeCompileCache: "disabled",
      })),
    ]);
    expect(result.summaries["current-backend"]).toMatchObject({
      firstObservation: { sampleCount: 1 },
      warmObservations: { sampleCount: 4 },
      allObservations: { sampleCount: 5 },
    });
  }, 45_000);
});
