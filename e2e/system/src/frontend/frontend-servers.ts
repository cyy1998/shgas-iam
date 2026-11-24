import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { spawnOwnedProcessTree, waitForOwnedProcessTree } from "@iam/runtime/process";
import { createBoundedByteCapture } from "../command-capture.ts";
import { buildFrontends } from "./frontend-build.ts";
import {
  type FrontendApp,
  type FrontendOptions,
  frontendCacheRoot,
  frontendEnvironment,
  frontendPrefixes,
} from "./frontend-config.ts";
import { startStaticFrontendServer } from "./static-frontend.ts";

interface FrontendServer {
  ready: Promise<string>;
  stop(): Promise<void>;
}

export async function startFrontendServers(options: FrontendOptions & { devFrontend?: boolean }) {
  const repoRoot = resolve(options.repoRoot);
  const rpTerminalPath = join(repoRoot, "e2e", "system", "docker", "rp-terminal.html");
  options.signal?.throwIfAborted();

  if (!options.devFrontend) {
    const { admin, sso } = await buildFrontends(options);
    options.signal?.throwIfAborted();
    const server = startStaticFrontendServer({ admin: admin.directory, sso: sso.directory, rpTerminalPath });
    return { origins: { admin: server.origin, sso: server.origin }, stop: server.stop };
  }

  const cacheRoot = frontendCacheRoot(repoRoot);
  await mkdir(cacheRoot, { recursive: true });
  const cacheDirectory = await mkdtemp(join(cacheRoot, "dev-"));
  const started: FrontendServer[] = [];
  let stopped: Promise<void> | undefined;
  const stop = () => (stopped ??= stopDevFrontends(started, cacheDirectory));
  try {
    const admin = await start("admin");
    const sso = await start("sso");
    options.signal?.throwIfAborted();
    return { origins: { admin, sso }, stop };
  } catch (error) {
    await stop().catch((cleanupError) => {
      throw new AggregateError([error, cleanupError], "E2E Vite startup and cleanup failed");
    });
    throw error;
  }

  async function start(app: FrontendApp) {
    const directory = join(cacheDirectory, app);
    await mkdir(directory);
    const server = launchDevFrontend(app, options, repoRoot, directory, rpTerminalPath);
    started.push(server);
    return server.ready;
  }
}

async function stopDevFrontends(servers: readonly FrontendServer[], directory: string) {
  const results = await Promise.allSettled(servers.map((server) => server.stop()));
  const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (failures.length) throw new AggregateError(failures, `E2E Vite cleanup failed; cache retained at ${directory}`);
  await rm(directory, { recursive: true, force: true });
}

function launchDevFrontend(
  app: FrontendApp,
  options: FrontendOptions,
  repoRoot: string,
  cacheDirectory: string,
  rpTerminalPath: string,
): FrontendServer {
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  const startup = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const script = fileURLToPath(new URL("./vite-dev.mjs", import.meta.url));
  const prefix = frontendPrefixes[app];
  const args = [script, prefix, cacheDirectory];
  if (app === "sso") args.push(rpTerminalPath);
  const child = spawnOwnedProcessTree({
    executable: "node",
    args,
    cwd: join(repoRoot, "apps", app),
    env: { ...(options.hostEnvironment ?? process.env), ...frontendEnvironment(app, options), NODE_ENV: "development" },
  });
  const output = createBoundedByteCapture("tail", 8_192);
  child.stdout.on("data", (chunk) => output.append(chunk));
  child.stderr.on("data", (chunk) => output.append(chunk));
  const finished = waitForOwnedProcessTree(child, { signal, cleanupTimeoutMs: 5_000 });
  const stop = async () => {
    controller.abort();
    const report = await finished;
    if (report.cleanupFailure)
      throw new Error(`Vite process tree cleanup failed for ${app}`, { cause: report.cleanupFailure });
  };

  const ready = Promise.race([
    probeVite(cacheDirectory, prefix, startup),
    finished.then((report) => {
      throw new Error(`Vite exited before ${app} was ready`, {
        cause: report.executionFailure?.error ?? report.outcome,
      });
    }),
  ]).catch((error) => {
    throw new Error(`Vite startup failed for ${app}\n${output.toString()}`, { cause: error });
  });
  return { ready, stop };
}

async function probeVite(cacheDirectory: string, prefix: string, signal: AbortSignal) {
  const path = join(cacheDirectory, "port");
  while (true) {
    signal.throwIfAborted();
    const port = await readFile(path, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (/^[1-9]\d{0,4}\n$/.test(port) && Number(port) <= 65_535) {
      const origin = `http://127.0.0.1:${port.trimEnd()}`;
      const response = await fetch(`${origin}${prefix}/`, { signal, redirect: "manual" });
      await response.body?.cancel();
      if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) {
        throw new Error(`Vite did not serve ${prefix}/ (HTTP ${response.status})`);
      }
      return origin;
    }
    await setTimeout(50, undefined, { signal });
  }
}
