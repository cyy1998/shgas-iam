import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface WorkspaceManifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export async function readWorkspaceManifests(root: string) {
  const workspaces = new Map<string, { directory: string; manifest: WorkspaceManifest }>();
  for (const group of ["apps", "packages"]) {
    for (const entry of await readdir(join(root, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = `${group}/${entry.name}`;
      const contents = await readFile(join(root, directory, "package.json"), "utf8").catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        },
      );
      if (contents === undefined) continue;
      const manifest: WorkspaceManifest = JSON.parse(contents);
      if (manifest.name) workspaces.set(manifest.name, { directory, manifest });
    }
  }
  return workspaces;
}

export function workspaceDependencyClosure<T extends { manifest: WorkspaceManifest }>(
  root: string,
  workspaces: ReadonlyMap<string, T>,
  includeDev = true,
) {
  const selected = new Set<string>();
  visit(root);
  return selected;

  function visit(name: string) {
    if (selected.has(name)) return;
    const workspace = workspaces.get(name);
    if (workspace === undefined) throw new Error(`Unknown workspace dependency: ${name}`);
    selected.add(name);
    const { dependencies, devDependencies, optionalDependencies, peerDependencies } = workspace.manifest;
    for (const section of [
      dependencies,
      includeDev ? devDependencies : undefined,
      optionalDependencies,
      peerDependencies,
    ]) {
      for (const [dependency, version] of Object.entries(section ?? {})) {
        if (version.startsWith("workspace:")) visit(dependency);
      }
    }
  }
}
