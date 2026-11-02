/** @iam/api; Spec #283 / #294; one-off Windows artifact, review removal by 2026-11-26. */
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { check, requiredText } from "./check.fixture";
import { repositoryRoot, requireCandidate } from "./source.fixture";

const candidate = requiredText(process.argv[2], "Expected candidate SHA");
const output = resolve(requiredText(process.argv[3], "Expected a new external artifact directory"));
await requireCandidate(candidate);
check(!output.startsWith(repositoryRoot), "Artifacts must be outside the checkout");
await mkdir(output); // Never overwrite evidence from an earlier candidate.
await mkdir(join(output, "runtime"));
const entries = [
  ["api", "apps/api", "src/index.ts"],
  ["worker", "apps/worker", "src/index.ts"],
  ["iam-ops", "apps/ops", "src/index.ts"],
  ["windows-job-launcher", "packages/api-core", "src/process/windows-job-launcher.mjs"],
];
const receipts = [];
for (const [name, workspace, entry] of entries) {
  check(name && workspace && entry, "Artifact entry missing");
  const args = [
    "build",
    entry,
    "--target=bun",
    "--packages=bundle",
    "--compile",
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    "--windows-hide-console",
    `--metafile=${join(output, `${name}-metafile.json`)}`,
    `--outfile=${join(output, "runtime", `${name}.exe`)}`,
  ];
  const result = await runProcessCommandSmoke({
    label: `build ${name}`,
    completionTimeoutMs: 120000,
    cleanupTimeoutMs: 10000,
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args,
        cwd: join(repositoryRoot, workspace),
        env: process.env,
      }),
  });
  await writeFile(join(output, `${name}-build.log`), result.output);
  const meta = JSON.parse(await readFile(join(output, `${name}-metafile.json`), "utf8"));
  check(
    !Object.values<{ imports: Array<{ external?: boolean; path: string }> }>(meta.outputs).some((value) =>
      value.imports.some((item) => item.external && item.path.startsWith("@iam/")),
    ),
    "Artifact has external workspace imports",
  );
  receipts.push({ name, args, cwd: workspace });
}
await cp(
  join(repositoryRoot, "packages/api-core/src/process/windows-job-supervisor.ps1"),
  join(output, "runtime/windows-job-supervisor.ps1"),
);
await cp(join(repositoryRoot, "apps/api/static"), join(output, "runtime/static"), { recursive: true });
await cp(join(repositoryRoot, "packages/db/src/migrations"), join(output, "migrations"), { recursive: true });
async function files(directory: string): Promise<Array<{ path: string; sha256: string }>> {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    check(!entry.isSymbolicLink(), "Artifact symlink is unsupported");
    if (entry.isDirectory()) result.push(...(await files(path)));
    else
      result.push({
        path: relative(output, path).replaceAll("\\", "/"),
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      });
  }
  return result;
}
await requireCandidate(candidate);
await writeFile(
  join(output, "manifest.json"),
  JSON.stringify(
    {
      sourceCommit: candidate,
      compiler: Bun.version,
      autoloadDotenv: false,
      autoloadBunfig: false,
      externalWorkspaceImports: [],
      runtimeFiles: await files(join(output, "runtime")),
      migrationFiles: await files(join(output, "migrations")),
      receipts,
    },
    null,
    2,
  ),
);
console.log(`Built fixed Document candidate ${candidate}`);
