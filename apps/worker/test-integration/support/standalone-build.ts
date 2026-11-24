import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/test-support/process-smoke-harness";

const workerFile = "worker.exe";
const launcherFile = "windows-job-launcher.exe";
const supervisorFile = "windows-job-supervisor.ps1";
const processDirectory = "packages/runtime/src/process";
const buildName = /^build-[a-zA-Z0-9]+$/u;

export async function prepareWorkerStandalone(options: {
  repositoryRoot: string;
  compile?: (entry: string, output: string) => Promise<void>;
}) {
  const { repositoryRoot } = options;
  const compile =
    options.compile ??
    (async (entry, output) => {
      await runProcessCommandSmoke({
        label: "compile Worker repair standalone fixture",
        completionTimeoutMs: 20_000,
        cleanupTimeoutMs: 5_000,
        start: () =>
          spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              "build",
              entry,
              "--compile",
              "--packages=bundle",
              "--no-compile-autoload-dotenv",
              "--no-compile-autoload-bunfig",
              "--windows-hide-console",
              `--outfile=${output}`,
            ],
            cwd: resolve(repositoryRoot, "apps/worker"),
            env: process.env,
          }),
      });
    });
  const fingerprint = await standaloneFingerprint(repositoryRoot);
  const cache = join(repositoryRoot, ".cache", "integration-worker-standalone");
  const record = join(cache, `${fingerprint}.ready`);
  const cached = await readCachedWorker(cache, record);
  if (cached) return cached;

  return await runWithOwnedTestResources(async ({ registerCleanup }) => {
    await mkdir(cache, { recursive: true });
    const directory = await mkdtemp(join(cache, "build-"));
    const pendingRecord = join(cache, `${basename(directory)}.pending`);
    let published = false;
    registerCleanup(() => (published ? undefined : rm(directory, { recursive: true, force: true })));
    registerCleanup(() => rm(pendingRecord, { force: true }));

    const worker = join(directory, workerFile);
    await compile(join(repositoryRoot, "apps/worker/src/index.ts"), worker);
    await compile(join(repositoryRoot, processDirectory, "windows-job-launcher.mjs"), join(directory, launcherFile));
    await copyFile(join(repositoryRoot, processDirectory, supervisorFile), join(directory, supervisorFile));
    if (!(await hasArtifacts(directory))) throw new Error("Standalone Worker build did not produce all artifacts");
    if ((await standaloneFingerprint(repositoryRoot)) !== fingerprint)
      throw new Error("Standalone Worker build inputs changed during compilation");

    const concurrent = await readCachedWorker(cache, record);
    if (concurrent) return concurrent;
    // Each builder owns a distinct generation. Publish only after both executables and
    // the adjacent supervisor are present, and never remove a generation another process may be using.
    await writeFile(pendingRecord, basename(directory));
    try {
      await rename(pendingRecord, record);
    } catch (error) {
      const publishedByPeer = await readCachedWorker(cache, record);
      if (publishedByPeer) return publishedByPeer;
      throw error;
    }
    published = true;
    return worker;
  });
}

async function readCachedWorker(cache: string, record: string) {
  const generation = await readFile(record, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (!buildName.test(generation)) return undefined;
  const directory = join(cache, generation);
  return (await hasArtifacts(directory)) ? join(directory, workerFile) : undefined;
}

async function hasArtifacts(directory: string) {
  const files = await Promise.all(
    [workerFile, launcherFile, supervisorFile].map((name) => stat(join(directory, name), { throwIfNoEntry: false })),
  );
  return files.every((file) => file?.isFile() && file.size > 0);
}

async function standaloneFingerprint(root: string) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify([Bun.version, process.platform, process.arch]));
  // Bundling follows workspace imports. Include package sources and metadata so new
  // transitive imports, patches and launcher/supervisor changes also invalidate the build.
  const paths = ["pnpm-lock.yaml"];
  for (const pattern of [
    "apps/worker/src/**/*",
    "apps/worker/*.json",
    "apps/worker/bunfig.toml",
    "packages/*/src/**/*",
    "packages/*/*.json",
    "patches/**/*",
    "package.json",
    "pnpm-workspace.yaml",
    "bunfig.toml",
  ]) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: root })) {
      const normalized = path.replaceAll("\\", "/");
      if (!normalized.split("/").includes("__tests__")) paths.push(normalized);
    }
  }
  hash.update(await readFile(import.meta.path)); // Includes the build recipe.
  for (const path of paths.sort()) {
    const content = await readFile(join(root, path));
    hash.update(JSON.stringify([path, content.byteLength])).update(content);
  }
  return hash.digest("hex");
}
