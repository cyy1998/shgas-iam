import { globSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const buildDependencySections = ["dependencies", "devDependencies", "optionalDependencies"];
const productionDependencySections = ["dependencies", "optionalDependencies", "peerDependencies"];

function readWorkspacePatterns(repoRoot) {
  const lines = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8").split(/\r?\n/u);
  const start = lines.findIndex((line) => /^packages:(?:[ \t]|$)/u.test(line));
  if (start === -1) return ["**"];

  // The repository declares workspace globs as a top-level YAML block list.
  const header = lines[start].slice("packages:".length).trim();
  if (/^\[\s*\]\s*(?:#.*)?$/u.test(header)) return [];
  if (header && !header.startsWith("#")) {
    throw new Error("Expected a packages block list in pnpm-workspace.yaml");
  }

  const patterns = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^\S/u.test(line) && !trimmed.startsWith("- ")) break;
    const item = /^-\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^"'#][^#]*?))\s*(?:#.*)?$/u.exec(trimmed);
    if (!item) throw new Error("Expected a workspace glob in pnpm-workspace.yaml packages");
    const [, doubleQuoted, singleQuoted, plain] = item;
    const pattern =
      doubleQuoted !== undefined
        ? JSON.parse(`"${doubleQuoted}"`)
        : (singleQuoted?.replaceAll("''", "'") ?? plain?.trim());
    if (!pattern) throw new Error("Expected a nonempty workspace glob in pnpm-workspace.yaml packages");
    patterns.push(pattern);
  }
  return patterns;
}

function findWorkspaceManifests(repoRoot) {
  const include = [];
  const exclude = ["**/node_modules", "**/bower_components", "**/.git"];
  for (const pattern of readWorkspacePatterns(repoRoot)) {
    const negative = pattern.startsWith("!");
    const directory = (negative ? pattern.slice(1) : pattern).replace(/\/+$/u, "");
    const manifestPattern = directory ? `${directory}/package.json` : "package.json";
    (negative ? exclude : include).push(manifestPattern);
  }
  const manifestPaths = new Set(globSync(include, { cwd: repoRoot, exclude }));
  manifestPaths.delete("package.json");
  return [...manifestPaths].sort();
}

function dependencyEntries(manifest, sections) {
  return sections.flatMap((section) =>
    Object.entries(manifest[section] ?? {}).filter(([, specifier]) => typeof specifier === "string"),
  );
}

export function collectWorkspaceGraph(repoRoot) {
  const byName = new Map();
  const byManifestPath = new Map();
  const invalidManifests = new Set();
  for (const manifestPath of findWorkspaceManifests(repoRoot)) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(repoRoot, manifestPath), "utf8"));
    } catch {
      invalidManifests.add(manifestPath);
      continue;
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      invalidManifests.add(manifestPath);
      continue;
    }
    const node = {
      name: typeof manifest.name === "string" ? manifest.name : undefined,
      directory: dirname(manifestPath),
      manifestPath,
      manifest,
      iamWorkspace: manifest.iamWorkspace,
      buildDependencies: dependencyEntries(manifest, buildDependencySections).filter(([, specifier]) =>
        specifier.startsWith("workspace:"),
      ),
      productionDependencies: dependencyEntries(manifest, productionDependencySections),
    };
    if (node.name) byName.set(node.name, node);
    byManifestPath.set(manifestPath, node);
  }
  return { byName, byManifestPath, invalidManifests };
}

export function selectWorkspaces(graph, { kind, gate, tier }) {
  return [...graph.byManifestPath.values()].filter(({ iamWorkspace }) => {
    if (kind && iamWorkspace?.kind !== kind) return false;
    if (gate && !(Array.isArray(iamWorkspace?.gates) && iamWorkspace.gates.includes(gate))) return false;
    const declaredTier = iamWorkspace?.architecture?.tier;
    return !tier || tier === declaredTier || (tier === "layered-backend" && declaredTier === "public-api");
  });
}

export function expandWorkspaceClosure(graph, manifestPaths, dependencyKind = "build") {
  const closure = new Set(manifestPaths);
  // Set iteration also visits paths added during the walk.
  for (const manifestPath of closure) {
    const node = graph.byManifestPath.get(manifestPath);
    if (!node) continue;
    const dependencies = dependencyKind === "build" ? node.buildDependencies : node.productionDependencies;
    for (const [name, specifier] of dependencies) {
      const targetName = /^(?:npm|workspace):((?:@[^/]+\/)?[^@/:]+)@/u.exec(specifier)?.[1] ?? name;
      const target = graph.byName.get(targetName);
      if (target) closure.add(target.manifestPath);
    }
  }
  return closure;
}
