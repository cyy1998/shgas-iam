import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readWorkspaceManifests, workspaceDependencyClosure } from "./workspace-inputs.ts";

interface TemplateInput {
  path: string;
  content: string | Uint8Array;
}

const hashPattern = /^[a-f0-9]{48}$/u;
const templatePattern = /^iam_e2e_tpl_[a-f0-9]{48}$/u;
const seedFiles = [
  "database-template.ts",
  "gateway-credential.ts",
  "seed-cli.ts",
  "seed-owner.ts",
  "seed-receipt.ts",
  "seed.ts",
  "sms-provider.ts",
  "wecom-provider.ts",
];

export async function readTemplateSourceFingerprint(repositoryRoot: string) {
  const inputs = await readTemplateSourceInputs(repositoryRoot);
  return fingerprintTemplateInputs(inputs);
}

export async function readTemplateSourceInputs(repositoryRoot: string) {
  // The Worker publishes the documents stored in the template. Include its runtime
  // dependencies and the seed owner's dependencies as independent roots.
  const manifests = await readWorkspaceManifests(repositoryRoot);
  const names = new Set(
    ["@iam/worker", "@iam/assignment-resolution", "@iam/db", "@iam/documents", "@iam/subject-access"].flatMap(
      (name) => [...workspaceDependencyClosure(name, manifests, false)],
    ),
  );
  const seedWorkspaces = [...names].map((name) => {
    const workspace = manifests.get(name);
    if (!workspace) throw new Error(`Missing seed workspace ${name}`);
    return workspace.directory;
  });
  const [sources, configuration] = await Promise.all([
    Promise.all(seedWorkspaces.map((workspace) => readDirectory(repositoryRoot, `${workspace}/src`))),
    Promise.all(
      [
        "pnpm-lock.yaml",
        ...seedWorkspaces.map((workspace) => `${workspace}/package.json`),
        ...seedFiles.map((file) => `e2e/system/src/${file}`),
      ].map(async (path) => ({ path, content: await readFile(join(repositoryRoot, path)) })),
    ),
  ]);
  const sourceInputs = sources.flat();
  if (!sourceInputs.some(({ path }) => path.startsWith("packages/db/src/migrations/"))) {
    throw new Error("E2E template requires the PostgreSQL migration set");
  }
  return [...sourceInputs, ...configuration];
}

export function fingerprintTemplateInputs(inputs: readonly TemplateInput[]) {
  const hash = createHash("sha256");
  for (const { path, content } of [...inputs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const byteLength = typeof content === "string" ? Buffer.byteLength(content) : content.byteLength;
    hash.update(`${Buffer.byteLength(path)}:${path}${byteLength}:`).update(content);
  }
  return hash.digest("hex").slice(0, 48);
}

export function templateDatabaseName(fingerprint: string) {
  if (!hashPattern.test(fingerprint)) throw new Error("Invalid E2E PostgreSQL template fingerprint");
  return `iam_e2e_tpl_${fingerprint}`;
}

export function obsoleteTemplateDatabases(databases: readonly string[], current: string) {
  return databases.filter((name) => templatePattern.test(name) && name !== current);
}

async function readDirectory(root: string, directory: string): Promise<TemplateInput[]> {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const inputs = await Promise.all(
    entries
      .filter((entry) => entry.name !== "__tests__" && !entry.name.endsWith(".test.ts"))
      .map(async (entry) => {
        const path = `${directory}/${entry.name}`;
        return entry.isDirectory()
          ? await readDirectory(root, path)
          : [{ path, content: await readFile(join(root, path)) }];
      }),
  );
  return inputs.flat();
}
