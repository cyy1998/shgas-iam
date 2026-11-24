import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { writeAtomicJsonFile } from "../atomic-json-file.ts";
import { captureCommand } from "../command-runner.ts";
import { readWorkspaceManifests, workspaceDependencyClosure } from "../workspace-inputs.ts";
import {
  type FrontendApp,
  type FrontendOptions,
  frontendCacheRoot,
  frontendEnvironment,
  vitePackageRoot,
} from "./frontend-config.ts";
import {
  type FrontendBuildFingerprint,
  type FrontendWorkspaceInputs,
  fingerprintFrontendInputs,
  matchesFrontendBuild,
} from "./frontend-fingerprint.ts";

interface FrontendBuildRecord extends FrontendBuildFingerprint {
  directory: string;
}

const fingerprintFilename = ".build-fingerprint.json";
const ignoredInputDirectories = new Set([
  ".cache",
  ".git",
  ".reports",
  ".turbo",
  "__tests__",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-integration",
  "test-results",
]);
const sharedInputFiles = ["pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc", "package.json"];

interface CachedFrontendOptions {
  repoRoot: string;
  app: FrontendApp;
  cacheRoot: string;
  buildEnvironment: Readonly<Record<string, string>>;
  hostEnvironment?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export async function buildFrontends(options: FrontendOptions) {
  options.signal?.throwIfAborted();
  const repoRoot = resolve(options.repoRoot);
  const inputs = await readFrontendInputs(repoRoot, ["@iam/admin", "@iam/sso"]);
  const build = (app: FrontendApp) =>
    buildFrontend(
      {
        ...options,
        repoRoot,
        app,
        cacheRoot: frontendCacheRoot(repoRoot),
        buildEnvironment: frontendEnvironment(app, options),
      },
      inputs,
    );
  const admin = await build("admin");
  const sso = await build("sso");
  return { admin, sso };
}

export async function buildCachedFrontend(options: CachedFrontendOptions) {
  options.signal?.throwIfAborted();
  const repoRoot = resolve(options.repoRoot);
  const inputs = await readFrontendInputs(repoRoot, [`@iam/${options.app}`]);
  return buildFrontend({ ...options, repoRoot }, inputs);
}

async function buildFrontend(options: CachedFrontendOptions, inputs: Awaited<ReturnType<typeof readFrontendInputs>>) {
  const { app, repoRoot, buildEnvironment: environment } = options;
  const appName = `@iam/${app}`;
  const fingerprint = fingerprintFrontendInputs(appName, inputs.workspaces, inputs.sharedFiles, environment);
  const cache = join(options.cacheRoot, app);
  const recordPath = join(cache, fingerprintFilename);
  const previous = await readBuildRecord(recordPath);
  options.signal?.throwIfAborted();
  if (previous?.fingerprint === fingerprint) {
    const directory = join(cache, previous.directory);
    const files = await readFileDigests(directory).catch((error) => {
      if (isMissingFile(error)) return {};
      throw error;
    });
    options.signal?.throwIfAborted();
    if (matchesFrontendBuild(previous, fingerprint, files)) return { directory, rebuilt: false };
  }

  // Each server retains its own complete build while concurrent startups publish new ones.
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "build-"));
  try {
    const cwd = join(repoRoot, "apps", app);
    await captureCommand(
      "node",
      [join(vitePackageRoot(cwd), "bin", "vite.js"), "build", "--outDir", directory, "--emptyOutDir"],
      {
        cwd,
        env: { ...(options.hostEnvironment ?? process.env), ...environment, NODE_ENV: "production" },
        signal: options.signal,
        capture: { mode: "tail", maxBytes: 16_384 },
      },
    );
    const files = await readFileDigests(directory);
    if (!files["index.html"]) throw new Error(`Vite build for ${app} did not produce index.html`);
    const current = await readFrontendInputs(repoRoot, [appName]);
    if (fingerprintFrontendInputs(appName, current.workspaces, current.sharedFiles, environment) !== fingerprint) {
      throw new Error(`Frontend inputs for ${app} changed during the Vite build. Run the test command again.`);
    }
    options.signal?.throwIfAborted();
    const record: FrontendBuildRecord = { fingerprint, directory: basename(directory), files };
    await writeAtomicJsonFile(recordPath, record);
    return { directory, rebuilt: true };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch((cleanupError) => {
      throw new AggregateError([error, cleanupError], `Frontend build and cleanup failed for ${app}`);
    });
    throw error;
  }
}

async function readFrontendInputs(repoRoot: string, apps: readonly string[]) {
  const manifests = await readWorkspaceManifests(repoRoot);
  const workspaces = new Map<string, FrontendWorkspaceInputs>();
  const selected = new Set(apps.flatMap((app) => [...workspaceDependencyClosure(app, manifests)]));
  const sharedFiles: Record<string, string> = {};
  await Promise.all([
    ...sharedInputFiles.map(async (file) => {
      try {
        sharedFiles[file] = await fileDigest(join(repoRoot, file));
      } catch (error) {
        if (file === "pnpm-lock.yaml" || !isMissingFile(error)) throw error;
      }
    }),
    ...[...selected].map(async (name) => {
      const workspace = manifests.get(name);
      if (!workspace) throw new Error(`Missing frontend workspace ${name}`);
      const files = await readFileDigests(join(repoRoot, workspace.directory), { base: repoRoot, input: true });
      workspaces.set(name, { manifest: workspace.manifest, files });
    }),
  ]);
  return { workspaces, sharedFiles };
}

async function readFileDigests(directory: string, options: { base?: string; input?: boolean } = {}) {
  const paths: string[] = [];
  await collect(directory);
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        relative(options.base ?? directory, path)
          .split(sep)
          .join("/"),
        await fileDigest(path),
      ]),
    ),
  );

  async function collect(root: string) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (options.input && ignoredInputDirectories.has(entry.name)) continue;
      const path = join(root, entry.name);
      if (entry.isDirectory()) await collect(path);
      if (entry.isFile()) paths.push(path);
    }
  }
}

async function fileDigest(path: string) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function readBuildRecord(path: string): Promise<FrontendBuildRecord | undefined> {
  try {
    const record = await readJsonFile<FrontendBuildRecord>(path);
    if (
      typeof record?.fingerprint === "string" &&
      typeof record.directory === "string" &&
      /^build-[A-Za-z\d]+$/.test(record.directory) &&
      record.files &&
      typeof record.files === "object" &&
      !Array.isArray(record.files)
    )
      return record;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return undefined;
}

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
