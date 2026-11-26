import { execFileSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

const buildDependencySections = ["dependencies", "devDependencies", "optionalDependencies"];
const productionDependencySections = ["dependencies", "optionalDependencies", "peerDependencies"];

function readWorkspacePatterns(content) {
  let config;
  try {
    // The architecture guard runs in Bun. The Node gate uses the same bundled parser.
    config = globalThis.Bun
      ? Bun.YAML.parse(content)
      : JSON.parse(
          execFileSync(
            "bun",
            ["--no-env-file", "-e", "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))"],
            {
              input: content,
              encoding: "utf8",
              stdio: ["pipe", "pipe", "pipe"],
            },
          ),
        );
  } catch (error) {
    throw new Error(`Could not parse pnpm-workspace.yaml: ${error.message}`, { cause: error });
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Expected a workspace configuration mapping in pnpm-workspace.yaml");
  }
  const patterns = Object.hasOwn(config, "packages") ? config.packages : ["**"];
  if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== "string" || !pattern.trim())) {
    throw new Error("Expected a list of nonempty workspace globs in pnpm-workspace.yaml packages");
  }
  return patterns;
}

function findWorkspaceManifests(repoRoot, content, snapshot) {
  const include = [];
  const excludedDirectories = ["**/node_modules", "**/bower_components", "**/.git"];
  const exclude = [];
  for (const pattern of readWorkspacePatterns(content)) {
    const negative = pattern.startsWith("!");
    const directory = (negative ? pattern.slice(1) : pattern).replace(/^(?:\.\/)+|\/+$/gu, "");
    const manifestPattern = directory ? `${directory}/package.json` : "package.json";
    (negative ? exclude : include).push(manifestPattern);
  }
  const excludedPaths = [...exclude, ...excludedDirectories.map((directory) => `${directory}/**`)];
  const manifestPaths = snapshot
    ? [...snapshot.paths].filter(
        (path) =>
          path.endsWith("/package.json") &&
          include.some((pattern) => posix.matchesGlob(path, pattern)) &&
          !excludedPaths.some((pattern) => posix.matchesGlob(path, pattern)),
      )
    : globSync(include, { cwd: repoRoot, exclude: [...exclude, ...excludedDirectories] });
  return [...new Set(manifestPaths)].filter((path) => path !== "package.json").sort();
}

function dependencyEntries(manifest, sections) {
  return sections.flatMap((section) =>
    Object.entries(manifest[section] ?? {}).flatMap(([name, specifier]) =>
      typeof specifier === "string" ? [{ section, name, specifier }] : [],
    ),
  );
}

export function parseWorkspaceManifest(content) {
  try {
    const manifest = JSON.parse(content);
    if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) return manifest;
  } catch {
    return undefined;
  }
}

export function collectWorkspaceGraph(repoRoot, snapshot) {
  const readFile = snapshot?.readFile ?? ((path) => readFileSync(join(repoRoot, path), "utf8"));
  const content = readFile("pnpm-workspace.yaml");
  if (content === undefined) throw new Error("Could not read pnpm-workspace.yaml");

  const byName = new Map();
  const byManifestPath = new Map();
  const invalidManifests = new Set();
  for (const manifestPath of findWorkspaceManifests(repoRoot, content, snapshot)) {
    const manifestText = readFile(manifestPath);
    const manifest = parseWorkspaceManifest(manifestText);
    if (!manifest) {
      invalidManifests.add(manifestPath);
      continue;
    }
    const node = {
      name: typeof manifest.name === "string" ? manifest.name : undefined,
      directory: posix.dirname(manifestPath),
      manifestPath,
      manifest,
      manifestText,
      iamWorkspace: manifest.iamWorkspace,
      buildDependencies: dependencyEntries(manifest, buildDependencySections).filter(({ specifier }) =>
        specifier.startsWith("workspace:"),
      ),
      productionDependencies: dependencyEntries(manifest, productionDependencySections),
    };
    if (node.name) byName.set(node.name, node);
    byManifestPath.set(manifestPath, node);
  }
  return { byName, byManifestPath, invalidManifests };
}

export function resolveWorkspaceDependency(graph, from, dependency) {
  const { name, specifier } = dependency;
  const workspacePath = specifier.startsWith("workspace:") ? specifier.slice("workspace:".length) : undefined;
  if (workspacePath && /^\.\.?(?:\/|$)/u.test(workspacePath)) {
    const workspace = graph.byManifestPath.get(posix.join(from.directory, workspacePath, "package.json"));
    return { name: workspace?.name, workspace };
  }
  const targetName = /^(?:npm|workspace):((?:@[^/]+\/)?[^@/:]+)@/u.exec(specifier)?.[1] ?? name;
  return { name: targetName, workspace: graph.byName.get(targetName) };
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
    for (const dependency of dependencies) {
      const { workspace: target } = resolveWorkspaceDependency(graph, node, dependency);
      if (target) closure.add(target.manifestPath);
    }
  }
  return closure;
}
