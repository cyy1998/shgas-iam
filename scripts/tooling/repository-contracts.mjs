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
    ...(existsSync(join(repoRoot, "e2e", "system")) ? [join(repoRoot, "e2e", "system")] : []),
  ];
  const workspaces = workspaceDirectories
    .flatMap((workspaceDirectory) => {
      const manifestPath = join(workspaceDirectory, "package.json");
      if (!existsSync(manifestPath)) return [];
      const manifest = readJson(manifestPath);
      return [
        {
          name: manifest.name,
          path: relative(repoRoot, workspaceDirectory),
          scripts: manifest.scripts ?? {},
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    globalTurboConcurrency: turbo.concurrency,
    rootScripts: rootPackage.scripts ?? {},
    turboTasks: turbo.tasks ?? {},
    workspaces,
  };
}

function listDirectories(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(path, entry.name));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
