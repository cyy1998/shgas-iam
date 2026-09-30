import { access, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type QualityWorkspace = {
  manifest: string;
  name: string;
  workspace: string;
};

export type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name: string;
  scripts?: Record<string, string>;
};

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(moduleDirectory, "../..");

export async function discoverQualityWorkspaces(): Promise<QualityWorkspace[]> {
  const workspacePaths = [
    ...(await listWorkspaceDirectories("apps")),
    ...(await listWorkspaceDirectories("packages")),
    "gateway",
    "e2e/system",
  ];
  const workspaces = await Promise.all(
    workspacePaths.map(async (workspace) => {
      const manifest = await readPackageManifest(`${workspace}/package.json`);
      return {
        manifest: `${workspace}/package.json`,
        name: manifest.name,
        workspace,
      };
    }),
  );
  return workspaces.sort((left, right) => left.name.localeCompare(right.name));
}

export async function readPackageManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(resolve(repoRoot, path), "utf8")) as PackageManifest;
}

async function listWorkspaceDirectories(parent: string) {
  const entries = await readdir(resolve(repoRoot, parent), { withFileTypes: true });
  const workspaces: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const workspace = `${parent}/${entry.name}`;
    try {
      await access(resolve(repoRoot, workspace, "package.json"));
      workspaces.push(workspace);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return workspaces.sort();
}
