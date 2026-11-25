import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const smokeProductionApps = {
  backend: ["apps/api", "apps/admin-api", "apps/worker", "apps/gateway"],
  frontend: ["apps/admin", "apps/sso"],
};

const e2eRuntimeApps = {
  backend: ["apps/api", "apps/admin-api", "apps/worker", "apps/gateway", "packages/db", "packages/runtime"],
  frontend: ["apps/admin", "apps/sso"],
};

const rootPackagingFields = [
  "name",
  "packageManager",
  "engines",
  "pnpm",
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "overrides",
];

const backendPackagingFields = [
  "name",
  "type",
  "main",
  "module",
  "exports",
  "imports",
  "bin",
  "files",
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
];

const frontendPackagingFields = [...backendPackagingFields, "sideEffects", "devDependencies"];

const workspaceDependencySections = ["dependencies", "devDependencies", "optionalDependencies"];

const unconditionalContainerSmokeMatchers = [
  (path) => path === "Dockerfile" || path.endsWith("/Dockerfile"),
  (path) => path === "nginx.conf" || path.endsWith("/nginx.conf"),
  (path) => path === "pnpm-lock.yaml" || path.endsWith("/pnpm-lock.yaml"),
  (path) => path === "pnpm-workspace.yaml",
  (path) => path === ".npmrc",
  (path) => path === ".husky/install.mjs",
  (path) => path.startsWith("patches/"),
  (path) => path.startsWith("e2e/system/docker/"),
  (path) => path === "e2e/system/container-smoke.spec.ts",
  (path) => path === "e2e/system/playwright.container-smoke.config.ts",
  (path) => path === "e2e/system/src/container-smoke.ts",
  (path) => path === "e2e/system/src/container-smoke-build.ts",
  (path) => path === "scripts/run-verification-gate.mjs" || path === "scripts/verification-gate-selection.mjs",
];

const unconditionalE2eRuntimeMatchers = [
  (path) => path.startsWith("e2e/system/"),
  (path) => path.startsWith("packages/runtime/"),
  (path) => path.startsWith("scripts/test-resources/"),
  (path) => path === "scripts/run-verification-gate.mjs" || path === "scripts/verification-gate-selection.mjs",
  (path) => path === "pnpm-lock.yaml",
  (path) => path === "pnpm-workspace.yaml",
  (path) => path === ".npmrc",
  (path) => path === "turbo.json",
  (path) => /(?:^|\/)vite\.config\.[^/]+$/u.test(path),
];

function isPackageManifest(path) {
  return path === "package.json" || path.endsWith("/package.json");
}

function collectDockerCopyManifests(content) {
  const manifests = new Set();
  for (const line of content.split(/\r?\n/u)) {
    const match = /^\s*COPY\s+(\S+)\s+\S+\s*$/u.exec(line);
    const source = match?.[1]?.replace(/^\.\//u, "");
    if (source && isPackageManifest(source)) manifests.add(source);
  }
  return manifests;
}

function collectWorkspaceGraph(repoRoot) {
  const byName = new Map();
  const byManifestPath = new Map();
  const invalidManifests = new Set();
  for (const parent of ["apps", "packages"]) {
    const parentDir = join(repoRoot, parent);
    if (!existsSync(parentDir)) continue;
    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = `${parent}/${entry.name}/package.json`;
      const absolute = join(repoRoot, manifestPath);
      if (!existsSync(absolute)) continue;
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(absolute, "utf8"));
      } catch {
        invalidManifests.add(manifestPath);
        continue;
      }
      const dependencies = workspaceDependencySections.flatMap((section) =>
        Object.entries(manifest[section] ?? {})
          .filter(([, version]) => typeof version === "string" && version.startsWith("workspace:"))
          .map(([name]) => name),
      );
      const node = { name: manifest.name, manifestPath, dependencies };
      if (manifest.name) byName.set(manifest.name, node);
      byManifestPath.set(manifestPath, node);
    }
  }
  return { byName, byManifestPath, invalidManifests };
}

function expandClosure(repoRoot, workspaceDirectories, graph, options = {}) {
  const { includeDockerCopies = true } = options;
  const manifestPaths = new Set();
  const queue = [];
  const enqueueManifest = (manifestPath) => {
    if (manifestPaths.has(manifestPath)) return;
    manifestPaths.add(manifestPath);
    const node = graph.byManifestPath.get(manifestPath);
    if (node) queue.push(node);
  };

  for (const workspaceDir of workspaceDirectories) {
    enqueueManifest(`${workspaceDir}/package.json`);
    if (includeDockerCopies) {
      const dockerfilePath = join(repoRoot, workspaceDir, "Dockerfile");
      if (existsSync(dockerfilePath)) {
        for (const copied of collectDockerCopyManifests(readFileSync(dockerfilePath, "utf8"))) {
          if (copied !== "package.json") enqueueManifest(copied);
        }
      }
    }
  }

  while (queue.length > 0) {
    const node = queue.shift();
    for (const depName of node.dependencies) {
      const target = graph.byName.get(depName);
      if (target) enqueueManifest(target.manifestPath);
    }
  }
  return manifestPaths;
}

export function collectContainerSmokeManifestClosures(repoRoot) {
  const graph = collectWorkspaceGraph(repoRoot);
  return {
    frontend: expandClosure(repoRoot, smokeProductionApps.frontend, graph),
    backend: expandClosure(repoRoot, smokeProductionApps.backend, graph),
    invalidManifests: graph.invalidManifests,
  };
}

export function collectE2eRuntimeManifestClosures(repoRoot) {
  const graph = collectWorkspaceGraph(repoRoot);
  return {
    frontend: expandClosure(repoRoot, e2eRuntimeApps.frontend, graph, { includeDockerCopies: false }),
    backend: expandClosure(repoRoot, e2eRuntimeApps.backend, graph, { includeDockerCopies: false }),
    invalidManifests: graph.invalidManifests,
  };
}

function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalizeValue(value[key])]),
    );
  }
  return value;
}

function packagingSnapshot(manifest, scope, gate) {
  const fields =
    scope === "root" ? rootPackagingFields : scope === "frontend" ? frontendPackagingFields : backendPackagingFields;
  const snapshot = {};
  for (const field of fields) {
    if (Object.hasOwn(manifest, field) && manifest[field] !== undefined) {
      snapshot[field] = canonicalizeValue(manifest[field]);
    }
  }
  if (manifest.scripts && typeof manifest.scripts === "object") {
    if (scope === "frontend") {
      if (manifest.scripts.build !== undefined) snapshot["scripts.build"] = manifest.scripts.build;
      if (gate === "e2e-runtime" && manifest.scripts.dev !== undefined) snapshot["scripts.dev"] = manifest.scripts.dev;
    } else if (gate === "e2e-runtime" && scope === "backend") {
      if (manifest.scripts["db:migrate"] !== undefined) {
        snapshot["scripts.db:migrate"] = manifest.scripts["db:migrate"];
      }
    } else if (gate === "e2e-runtime" && scope === "root") {
      for (const [scriptName, scriptValue] of Object.entries(manifest.scripts)) {
        if (
          scriptValue !== undefined &&
          (scriptName === "test:e2e" || scriptName.startsWith("test:e2e:") || scriptName === "verify:e2e-runtime")
        ) {
          snapshot[`scripts.${scriptName}`] = scriptValue;
        }
      }
    }
  }
  return snapshot;
}

export function diffManifestPackagingFields(baseManifest, headManifest, scope, gate = "container-smoke") {
  const left = packagingSnapshot(baseManifest, scope, gate);
  const right = packagingSnapshot(headManifest, scope, gate);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changed = [];
  for (const key of [...keys].sort()) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) changed.push(key);
  }
  return changed;
}

function readGitFileAtRevision(repoRoot, revision, path) {
  const result = spawnSync("git", ["show", `${revision}:${path}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.signal || result.status !== 0) return undefined;
  return result.stdout;
}

function parseNameStatusOutput(output) {
  const entries = [];
  const tokens = output.split("\0");
  for (let index = 0; index < tokens.length; ) {
    const status = tokens[index++];
    if (!status) break;
    const path = tokens[index++];
    if (!path) break;
    entries.push({ status, path });
  }
  return entries;
}

function evaluateSemanticGateTrigger(options) {
  const { repoRoot, base, head = "HEAD", gate, pathLabel, unconditionalMatchers, collectClosures } = options;
  const diff = spawnSync("git", ["diff", "--name-status", "--no-renames", "-z", `${base}^{commit}`, head], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (diff.error || diff.signal || diff.status !== 0) {
    throw new Error(
      `Could not compare ${pathLabel} against the fixed verification base.${diff.error ? ` ${diff.error.message}` : ""}`,
    );
  }

  const changes = parseNameStatusOutput(diff.stdout);
  if (changes.length === 0) return { shouldRun: false, reasons: [] };

  const reasons = [];
  const manifestChanges = [];
  for (const change of changes) {
    if (unconditionalMatchers.some((matches) => matches(change.path))) {
      reasons.push(`${change.path} (${change.status})`);
    } else if (isPackageManifest(change.path)) {
      manifestChanges.push(change);
    }
  }
  if (reasons.length > 0 || manifestChanges.length === 0) {
    return { shouldRun: reasons.length > 0, reasons };
  }

  const closures = collectClosures(repoRoot);
  for (const change of manifestChanges) {
    if (closures.invalidManifests.has(change.path)) {
      reasons.push(`${change.path} (invalid JSON manifest)`);
      continue;
    }
    const scope =
      change.path === "package.json"
        ? "root"
        : closures.frontend.has(change.path)
          ? "frontend"
          : closures.backend.has(change.path)
            ? "backend"
            : undefined;
    if (!scope) continue;
    if (change.status !== "M") {
      reasons.push(`${change.path} (${change.status})`);
      continue;
    }
    const baseText = readGitFileAtRevision(repoRoot, `${base}^{commit}`, change.path);
    const headText = readGitFileAtRevision(repoRoot, head, change.path);
    if (baseText === undefined || headText === undefined) {
      reasons.push(`${change.path} (unreadable manifest diff)`);
      continue;
    }
    let baseManifest;
    let headManifest;
    try {
      baseManifest = JSON.parse(baseText);
      headManifest = JSON.parse(headText);
    } catch {
      reasons.push(`${change.path} (invalid JSON manifest)`);
      continue;
    }
    const changedFields = diffManifestPackagingFields(baseManifest, headManifest, scope, gate);
    if (changedFields.length > 0) {
      reasons.push(`${change.path} (${changedFields.join(", ")})`);
    }
  }

  return { shouldRun: reasons.length > 0, reasons };
}

export function evaluateContainerSmokeTrigger(options) {
  return evaluateSemanticGateTrigger({
    ...options,
    gate: "container-smoke",
    pathLabel: "packaging paths",
    unconditionalMatchers: unconditionalContainerSmokeMatchers,
    collectClosures: collectContainerSmokeManifestClosures,
  });
}

export function evaluateE2eRuntimeTrigger(options) {
  return evaluateSemanticGateTrigger({
    ...options,
    gate: "e2e-runtime",
    pathLabel: "E2E runtime paths",
    unconditionalMatchers: unconditionalE2eRuntimeMatchers,
    collectClosures: collectE2eRuntimeManifestClosures,
  });
}
