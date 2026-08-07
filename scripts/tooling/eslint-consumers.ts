import { access, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type EslintConsumer = {
  args: string[];
  config: string;
  manifest: string;
  name: string;
  workspace: string;
};

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name: string;
  scripts?: Record<string, string>;
};

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(moduleDirectory, "../..");
const configOwner = "@iam/eslint-config";

export async function readWorkspaceManifest(consumer: EslintConsumer) {
  return readPackageManifest(consumer.manifest);
}

export async function readConsumerConfigImports(consumer: EslintConsumer) {
  const source = await readFile(resolve(repoRoot, consumer.config), "utf8");
  return [...source.matchAll(/\bfrom\s+["']([^"']+)["']/gu)]
    .map(match => match[1])
    .sort();
}

export async function discoverEslintConsumers(): Promise<EslintConsumer[]> {
  const rootManifest = await readPackageManifest("package.json");
  const rootLintScript = rootManifest.scripts?.["lint:root"] ?? rootManifest.scripts?.lint;
  if (!rootLintScript)
    throw new Error("Root package has no lint:root or lint script");

  const workspacePaths = [
    ...await listWorkspaceDirectories("apps"),
    ...await listWorkspaceDirectories("packages"),
    "gateway",
  ];
  const workspaceConsumers = (await Promise.all(workspacePaths.map(async (workspace) => {
    const manifest = await readPackageManifest(`${workspace}/package.json`);
    if (manifest.name === configOwner)
      return undefined;

    const lintScript = manifest.scripts?.["lint:eslint"] ?? manifest.scripts?.lint;
    if (!lintScript)
      throw new Error(`${manifest.name} has no lint or lint:eslint script`);

    return {
      args: extractEslintArgs(lintScript, manifest.name),
      config: await findWorkspaceConfig(workspace, manifest.name),
      manifest: `${workspace}/package.json`,
      name: manifest.name,
      workspace,
    };
  }))).filter(consumer => consumer !== undefined);

  return [
    {
      args: extractEslintArgs(rootLintScript, "root"),
      config: "eslint.root.config.mjs",
      manifest: "package.json",
      name: "root",
      workspace: ".",
    },
    ...workspaceConsumers.sort((left, right) => left.name.localeCompare(right.name)),
  ];
}

async function findWorkspaceConfig(workspace: string, name: string) {
  for (const filename of ["eslint.config.js", "eslint.config.mjs"]) {
    const configPath = `${workspace}/${filename}`;
    try {
      await readFile(resolve(repoRoot, configPath), "utf8");
      return configPath;
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw error;
    }
  }

  throw new Error(`${name} has no ESLint flat config`);
}

async function listWorkspaceDirectories(parent: string) {
  const entries = await readdir(resolve(repoRoot, parent), { withFileTypes: true });
  const workspaces: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue;
    const workspace = `${parent}/${entry.name}`;
    try {
      await access(resolve(repoRoot, workspace, "package.json"));
      workspaces.push(workspace);
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw error;
    }
  }
  return workspaces.sort();
}

async function readPackageManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(resolve(repoRoot, path), "utf8")) as PackageManifest;
}

function extractEslintArgs(script: string, name: string) {
  const directCommand = script
    .split("&&")
    .map(command => command.trim())
    .find(command => command.startsWith("eslint "));
  if (!directCommand)
    throw new Error(`${name} lint entry does not contain a direct ESLint command`);

  const commandBody = directCommand.slice("eslint ".length).trim();
  if (/["'\\]/u.test(commandBody))
    throw new Error(`${name} lint entry requires unsupported shell quoting`);

  return commandBody.split(/\s+/u);
}
