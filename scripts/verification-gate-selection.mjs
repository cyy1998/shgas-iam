import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectWorkspaceGraph,
  expandWorkspaceClosure,
  parseWorkspaceManifest,
  selectWorkspaces,
} from "./workspace-graph.mjs";

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

const gateScripts = new Set([
  "scripts/run-verification-gate.mjs",
  "scripts/verification-gate-selection.mjs",
  "scripts/workspace-graph.mjs",
]);

const unconditionalContainerSmokeMatchers = [
  (path) => path === "nginx.conf" || path.endsWith("/nginx.conf"),
  (path) => path === "pnpm-lock.yaml" || path.endsWith("/pnpm-lock.yaml"),
  (path) => path === "pnpm-workspace.yaml",
  (path) => path === ".npmrc",
  (path) => path === ".husky/install.mjs",
  (path) => path.startsWith("patches/"),
  (path) => path.startsWith("e2e/system/docker/"),
  (path) => path === "docker/gateway/iam.dev.example.yaml",
  (path) => path === "e2e/system/container-smoke.spec.ts",
  (path) => path === "e2e/system/playwright.container-smoke.config.ts",
  (path) => path === "e2e/system/src/container-smoke.ts",
  (path) => path === "e2e/system/src/container-smoke-build.ts",
  (path) => path === "e2e/system/src/middleware-compose.ts",
  (path) => gateScripts.has(path),
];

const unconditionalE2eRuntimeMatchers = [
  (path) => path.startsWith("e2e/system/"),
  (path) => path === "docker/gateway/iam.dev.example.yaml",
  (path) => path.startsWith("packages/runtime/"),
  (path) => path.startsWith("scripts/test-resources/"),
  (path) => gateScripts.has(path),
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

function expandSmokeImageClosure(readDockerfile, graph, workspaces) {
  const manifestPaths = new Set();
  for (const { directory, manifestPath } of workspaces) {
    manifestPaths.add(manifestPath);
    if (!directory.startsWith("apps/")) continue;
    const dockerfile = readDockerfile(`${directory}/Dockerfile`);
    if (dockerfile === undefined) continue;
    for (const copied of collectDockerCopyManifests(dockerfile)) {
      if (copied !== "package.json") manifestPaths.add(copied);
    }
  }
  return expandWorkspaceClosure(graph, manifestPaths);
}

function workspaceManifestPaths(workspaces) {
  return workspaces.map(({ manifestPath }) => manifestPath);
}

export function collectContainerSmokeManifestClosures(repoRoot, snapshot) {
  const graph = collectWorkspaceGraph(repoRoot, snapshot);
  const readDockerfile =
    snapshot?.readFile ??
    ((path) => {
      const dockerfilePath = join(repoRoot, path);
      return existsSync(dockerfilePath) ? readFileSync(dockerfilePath, "utf8") : undefined;
    });
  const gate = "container-smoke";
  const frontend = selectWorkspaces(graph, { gate, kind: "frontend" });
  const backend = selectWorkspaces(graph, { gate, kind: "backend" });
  return {
    frontend: expandSmokeImageClosure(readDockerfile, graph, frontend),
    backend: expandSmokeImageClosure(readDockerfile, graph, backend),
    cli: expandWorkspaceClosure(graph, workspaceManifestPaths(selectWorkspaces(graph, { gate, kind: "cli" }))),
    dockerfiles: new Set(
      selectWorkspaces(graph, { gate })
        .filter(({ directory, iamWorkspace }) => directory.startsWith("apps/") && iamWorkspace.kind !== "cli")
        .map(({ directory }) => `${directory}/Dockerfile`),
    ),
    invalidManifests: graph.invalidManifests,
  };
}

export function collectE2eRuntimeManifestClosures(repoRoot, snapshot) {
  const graph = collectWorkspaceGraph(repoRoot, snapshot);
  const gate = "e2e-runtime";
  const frontend = selectWorkspaces(graph, { gate, kind: "frontend" });
  // The host runner declares its own workspace dependencies, including DB migration and runtime tooling.
  const backend = [
    ...selectWorkspaces(graph, { gate, kind: "backend" }),
    ...selectWorkspaces(graph, { gate, kind: "e2e" }),
  ];
  return {
    frontend: expandWorkspaceClosure(graph, workspaceManifestPaths(frontend)),
    backend: expandWorkspaceClosure(graph, workspaceManifestPaths(backend)),
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
    } else if (scope === "cli" && gate === "container-smoke") {
      if (manifest.scripts["iam-ops"] !== undefined) snapshot["scripts.iam-ops"] = manifest.scripts["iam-ops"];
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
  const scopes = Array.isArray(scope) ? scope : [scope];
  const snapshot = (manifest) => Object.assign({}, ...scopes.map((entry) => packagingSnapshot(manifest, entry, gate)));
  const left = snapshot(baseManifest);
  const right = snapshot(headManifest);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changed = [];
  for (const key of [...keys].sort()) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) changed.push(key);
  }
  return changed;
}

function readGit(repoRoot, args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function readGitSnapshot(repoRoot, revision) {
  const paths = new Set(readGit(repoRoot, ["ls-tree", "-r", "-z", "--full-tree", "--name-only", revision]).split("\0"));
  paths.delete("");
  const files = new Map();
  return {
    paths,
    readFile(path) {
      if (!paths.has(path)) return undefined;
      if (!files.has(path)) files.set(path, readGit(repoRoot, ["show", `${revision}:${path}`]));
      return files.get(path);
    },
  };
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
  let baseCommit;
  let headCommit;
  let diff;
  try {
    baseCommit = readGit(repoRoot, ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`]).trim();
    headCommit = readGit(repoRoot, ["rev-parse", "--verify", "--end-of-options", `${head}^{commit}`]).trim();
    diff = readGit(repoRoot, ["diff", "--name-status", "--no-renames", "-z", baseCommit, headCommit]);
  } catch (error) {
    throw new Error(`Could not compare ${pathLabel} against the fixed verification base: ${error.message}`, {
      cause: error,
    });
  }

  const changes = parseNameStatusOutput(diff);
  if (changes.length === 0) return { shouldRun: false, reasons: [] };

  const reasons = [];
  const manifestChanges = [];
  const appDockerfileChanges = [];
  for (const change of changes) {
    if (unconditionalMatchers.some((matches) => matches(change.path))) {
      reasons.push(`${change.path} (${change.status})`);
    } else if (isPackageManifest(change.path)) {
      manifestChanges.push(change);
    } else if (gate === "container-smoke" && change.path.startsWith("apps/") && change.path.endsWith("/Dockerfile")) {
      appDockerfileChanges.push(change);
    }
  }
  if (reasons.length > 0 || (manifestChanges.length === 0 && appDockerfileChanges.length === 0)) {
    return { shouldRun: reasons.length > 0, reasons };
  }

  const baseSnapshot = readGitSnapshot(repoRoot, baseCommit);
  const headSnapshot = readGitSnapshot(repoRoot, headCommit);
  const baseClosures = collectClosures(repoRoot, baseSnapshot);
  const headClosures = collectClosures(repoRoot, headSnapshot);
  for (const change of appDockerfileChanges) {
    if (baseClosures.dockerfiles.has(change.path) || headClosures.dockerfiles.has(change.path)) {
      reasons.push(`${change.path} (${change.status})`);
    }
  }
  if (reasons.length > 0) return { shouldRun: true, reasons };

  for (const change of manifestChanges) {
    if (baseClosures.invalidManifests.has(change.path) || headClosures.invalidManifests.has(change.path)) {
      reasons.push(`${change.path} (invalid JSON manifest)`);
      continue;
    }
    const scopes =
      change.path === "package.json"
        ? ["root"]
        : ["frontend", "backend", "cli"].filter(
            (scope) => baseClosures[scope]?.has(change.path) || headClosures[scope]?.has(change.path),
          );
    if (scopes.length === 0) continue;
    if (change.status !== "M") {
      reasons.push(`${change.path} (${change.status})`);
      continue;
    }
    const baseManifest = parseWorkspaceManifest(baseSnapshot.readFile(change.path));
    const headManifest = parseWorkspaceManifest(headSnapshot.readFile(change.path));
    if (!baseManifest || !headManifest) {
      reasons.push(`${change.path} (invalid JSON manifest)`);
      continue;
    }
    if (
      change.path !== "package.json" &&
      scopes.some((scope) => baseClosures[scope]?.has(change.path) !== headClosures[scope]?.has(change.path))
    ) {
      reasons.push(`${change.path} (gate workspace scope changed)`);
      continue;
    }
    const changedFields = diffManifestPackagingFields(baseManifest, headManifest, scopes, gate);
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
