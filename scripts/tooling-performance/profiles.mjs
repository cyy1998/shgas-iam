async function loadSharedConfigDependencies() {
  await import("@iam/eslint-config");
}

async function loadCuratedDependencies() {
  const { default: curatedImports } = await import("../../packages/eslint-config/benchmark/curated-imports.mjs");
  await curatedImports;
}

function defineProfile(
  configModule,
  workspace,
  firstFileLintArgs,
  lintArgs,
  loadDependencies = loadSharedConfigDependencies,
) {
  return {
    configModule,
    firstFileLintArgs: [
      ...firstFileLintArgs,
    ],
    lintArgs: [
      ...lintArgs,
    ],
    loadDependencies,
    workspace,
  };
}

function backendLintArgs(config) {
  return config
    ? [
        "--config",
        config,
        "src",
        "eslint.config.js",
      ]
    : ["src", "eslint.config.js"];
}

function backendFirstFileLintArgs(config) {
  return config
    ? [
        "--config",
        config,
        "src/audit/index.ts",
      ]
    : ["src/audit/index.ts"];
}

export const eslintBenchmarkProfiles = {
  "candidate-backend": defineProfile(
    "../../packages/eslint-config/benchmark/backend.config.mjs",
    "packages/domain",
    backendFirstFileLintArgs("../../packages/eslint-config/benchmark/backend.config.mjs"),
    backendLintArgs("../../packages/eslint-config/benchmark/backend.config.mjs"),
  ),
  "curated-backend": defineProfile(
    "../../packages/eslint-config/benchmark/curated-backend.config.mjs",
    "packages/domain",
    backendFirstFileLintArgs("../../packages/eslint-config/benchmark/curated-backend.config.mjs"),
    backendLintArgs("../../packages/eslint-config/benchmark/curated-backend.config.mjs"),
    loadCuratedDependencies,
  ),
  "current-backend": defineProfile(
    "../../packages/domain/eslint.config.js",
    "packages/domain",
    backendFirstFileLintArgs(),
    backendLintArgs(),
  ),
  "current-frontend": defineProfile(
    "../../apps/admin/eslint.config.mjs",
    "apps/admin",
    ["src/app.ts"],
    [
      "src",
      "test",
      "test-integration",
      ".umirc.ts",
      "playwright.config.ts",
      "vitest.shared.ts",
      "vitest.unit.config.ts",
      "vitest.integration.component.config.ts",
      "typings.d.ts",
      "eslint.config.mjs",
      "stylelint.config.mjs",
    ],
  ),
  "current-root": defineProfile(
    "../../eslint.root.config.mjs",
    ".",
    [
      "--config",
      "eslint.root.config.mjs",
      "scripts/benchmark-eslint-config.mjs",
    ],
    [
      "--config",
      "eslint.root.config.mjs",
      "scripts",
      "eslint.root.config.mjs",
      "eslint.frontend.config.mjs",
      "stylelint.frontend.config.mjs",
    ],
  ),
  "lean-backend": defineProfile(
    "../../packages/eslint-config/benchmark/lean-backend.config.mjs",
    "packages/domain",
    backendFirstFileLintArgs("../../packages/eslint-config/benchmark/lean-backend.config.mjs"),
    backendLintArgs("../../packages/eslint-config/benchmark/lean-backend.config.mjs"),
  ),
};

export async function buildConfig(profileName) {
  const profile = eslintBenchmarkProfiles[profileName];
  if (!profile)
    throw new Error(`Unknown ESLint benchmark profile: ${profileName}`);

  const importStartedAt = performance.now();
  await profile.loadDependencies();
  const importedAt = performance.now();
  const configModule = await import(profile.configModule);
  await configModule.default;
  const composedAt = performance.now();
  return {
    importMs: importedAt - importStartedAt,
    composeMs: composedAt - importedAt,
    totalMs: composedAt - importStartedAt,
  };
}
