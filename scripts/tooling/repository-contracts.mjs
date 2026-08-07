import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDirectory, "../..");

export function readToolingGraph(repoRoot = defaultRepoRoot) {
  const rootPackage = readJson(join(repoRoot, "package.json"));
  const turbo = readJson(join(repoRoot, "turbo.json"));
  const workspaceDirectories = [
    ...listDirectories(join(repoRoot, "apps")),
    ...listDirectories(join(repoRoot, "packages")),
    ...(existsSync(join(repoRoot, "gateway")) ? [join(repoRoot, "gateway")] : []),
  ];
  const workspaces = workspaceDirectories.flatMap((workspaceDirectory) => {
    const manifestPath = join(workspaceDirectory, "package.json");
    if (!existsSync(manifestPath))
      return [];
    const manifest = readJson(manifestPath);
    const configPath = ["eslint.config.js", "eslint.config.mjs"]
      .map(file => join(workspaceDirectory, file))
      .find(existsSync);
    return [{
      name: manifest.name,
      path: relative(repoRoot, workspaceDirectory),
      scripts: manifest.scripts ?? {},
      eslintConfigImports: configPath ? readImports(configPath) : [],
    }];
  }).sort((left, right) => left.name.localeCompare(right.name));

  return {
    globalTurboConcurrency: turbo.concurrency,
    globalTestTimeoutOverrides: readGlobalTestTimeoutOverrides(
      repoRoot,
      rootPackage,
      workspaceDirectories,
    ),
    rootScripts: rootPackage.scripts ?? {},
    turboTasks: turbo.tasks ?? {},
    workspaces,
  };
}

function readGlobalTestTimeoutOverrides(repoRoot, rootPackage, workspaceDirectories) {
  const manifestEntries = [
    { path: "package.json", manifest: rootPackage },
    ...workspaceDirectories.flatMap((workspaceDirectory) => {
      const manifestPath = join(workspaceDirectory, "package.json");
      return existsSync(manifestPath)
        ? [{ path: relative(repoRoot, manifestPath), manifest: readJson(manifestPath) }]
        : [];
    }),
  ];
  const scriptOverrides = manifestEntries.flatMap(({ path, manifest }) =>
    Object.entries(manifest.scripts ?? {}).flatMap(([scriptName, script]) => {
      if (!scriptName.includes("test"))
        return [];
      const flags = script.match(/--(?:test-?timeout|hook-?timeout|teardown-?timeout|timeout)(?:=|\s+)\S+/giu);
      return flags?.map(flag => `${path}#${scriptName}: ${flag}`) ?? [];
    }));
  const configOverrides = [repoRoot, ...workspaceDirectories].flatMap(directory =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile())
        return [];
      const isVitestConfig = /^vitest(?:\.config)?\.shared\.[cm]?[jt]s$/u.test(entry.name)
        || /^vitest\.config\.[cm]?[jt]s$/u.test(entry.name);
      const isBunConfig = entry.name === "bunfig.toml";
      if (!isVitestConfig && !isBunConfig)
        return [];

      const path = join(directory, entry.name);
      const source = readFileSync(path, "utf8");
      const patterns = isVitestConfig
        ? [/\btestTimeout\s*:/gu, /\bhookTimeout\s*:/gu, /\bteardownTimeout\s*:/gu]
        : [/^\s*timeout\s*=/gmu];
      return patterns.flatMap(pattern =>
        [...source.matchAll(pattern)].map(match =>
          `${relative(repoRoot, path).replaceAll("\\", "/")}: ${match[0].trim()}`));
    }));

  return [...scriptOverrides, ...configOverrides].sort();
}

function listDirectories(path) {
  if (!existsSync(path))
    return [];
  return readdirSync(path, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(path, entry.name));
}

function readImports(path) {
  const text = readFileSync(path, "utf8");
  return [...text.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
