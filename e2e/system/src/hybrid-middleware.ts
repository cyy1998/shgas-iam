import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  cleanupManagedResources,
  createManagedResourceRun,
  type ManagedResourceRun,
  managedCleanupCommand,
  managedServiceEndpoint,
  readManagedResourceRun,
  runManagedComposeCommand,
  saveManagedResourceRun,
  writeAtomicResourceRecord,
} from "../../../scripts/test-resources/managed-resources.mjs";
import { runWithCleanup } from "./bounded-operation.ts";
import {
  apisixBuildContext,
  createHybridCompose,
  e2eDatabaseName,
  e2eDatabasePassword,
  type HybridLifecycle,
  type HybridNetwork,
  type HybridPorts,
  selectHybridModes,
} from "./hybrid-compose.ts";
import { allocateAvailablePort } from "./port-allocation.ts";
import { recoverResidentHostProcesses, withResidentHostProcesses } from "./resident-host-processes.ts";
import { acquireResidentLock } from "./resident-lock.ts";

export interface HybridMiddleware {
  project: string;
  composeFile: string;
  network: HybridNetwork;
  ports: HybridPorts;
  databaseUrl: string;
  redisUrl: string;
  apisixAdminUrl: string;
  upstreamHost: string;
  hostEnvironment: NodeJS.ProcessEnv;
  probeUpstream: (upstream: { service: string; port: number }, signal?: AbortSignal) => Promise<void>;
}

interface ResidentOptions {
  repositoryRoot: string;
  residentDirectory?: string;
}

interface MiddlewareOptions extends ResidentOptions {
  fresh?: boolean;
  lifecycle?: HybridLifecycle;
  keep?: boolean;
  signal?: AbortSignal;
}

interface ResourceState {
  project: string;
  network: HybridNetwork;
  ports: HybridPorts;
}

const resourcePrefix = "test-results/integration";
const residentProject = /^iam-e2e-resident-[a-f0-9]{32}$/u;
const activeStacks = new WeakSet<HybridMiddleware>();
const portNames = ["postgres", "redis", "etcd", "http", "https", "admin"] as const;

export function isHybridResidentProject(project: string) {
  return residentProject.test(project);
}

export async function withHybridMiddleware<T>(
  options: MiddlewareOptions,
  use: (stack: HybridMiddleware) => Promise<T>,
) {
  const modes = selectHybridModes(options);
  if (modes.lifecycle === "resident") {
    const directory = residentDirectory(options);
    return await withResidentLock(directory, options.repositoryRoot, async () => {
      const existing = await readResidentState(directory);
      if (existing && existing.network !== modes.network) {
        throw new Error("E2E resident APISIX network mode changed; run test:e2e:down before restarting the stack");
      }
      await recoverResidentHostProcesses(directory);
      const { state, run } = await prepareResidentRun(options, directory, modes.network, existing);
      return await runWithCleanup(
        async () => {
          await startStack(run, options, state);
          return await withResidentHostProcesses(directory, async (env) =>
            useStack(await resolveStackConnection(run, state, modes.upstreamHost, env, options.signal), use),
          );
        },
        async () => {
          if (options.keep) {
            console.warn(
              `[e2e] Environment retained; cleanup: pnpm --filter @iam/e2e-system runtime:cleanup --project ${state.project}`,
            );
          }
        },
      );
    });
  }

  const state = await allocateState(modes.network, "fresh");
  const run = await registerRun(options.repositoryRoot, state, options, options.keep ?? false);
  return await runWithCleanup(
    async () => {
      await startStack(run, options, state);
      return await useStack(
        await resolveStackConnection(run, state, modes.upstreamHost, process.env, options.signal),
        use,
      );
    },
    async () => {
      if (run.record.keep) {
        run.record.status = "kept";
        await saveManagedResourceRun(run);
        console.warn(`[e2e] Environment retained; cleanup: ${managedCleanupCommand(run)}`);
      } else {
        await cleanupManagedResources(run, { timeoutMs: 120_000 });
      }
    },
  );
}

export function assertActiveHybridMiddleware(stack: HybridMiddleware) {
  if (!activeStacks.has(stack)) throw new Error("Hybrid E2E middleware must be owned by the current run");
}

async function useStack<T>(stack: HybridMiddleware, use: (stack: HybridMiddleware) => Promise<T>) {
  activeStacks.add(stack);
  try {
    return await use(stack);
  } finally {
    activeStacks.delete(stack);
  }
}

export async function cleanupHybridProject(options: ResidentOptions, project: string) {
  if (isHybridResidentProject(project)) {
    await cleanupHybridResident({ ...options, project });
    return;
  }
  const run = await readRun(options.repositoryRoot, project);
  await cleanupManagedResources(run, { timeoutMs: 120_000 });
}

export async function cleanupHybridResident(options: ResidentOptions & { project?: string }) {
  const directory = residentDirectory(options);
  await withResidentLock(directory, options.repositoryRoot, async () => {
    const state = await readResidentState(directory);
    if (options.project && state?.project !== options.project) {
      throw new Error(`No resident E2E resource record for exact project ${options.project}`);
    }
    await recoverResidentHostProcesses(directory);
    if (!state) return;
    const run = await readRun(residentResourceRoot(options.repositoryRoot, directory), state.project);
    await cleanupManagedResources(run, { timeoutMs: 120_000 });
    await rm(join(directory, "resident.json"));
  });
}

function residentDirectory(options: ResidentOptions) {
  return resolve(options.residentDirectory ?? join(homedir(), ".cache", "shgas-iam", "hybrid-e2e"));
}

function residentResourceRoot(repositoryRoot: string, directory: string) {
  // An AFK integration fixture can keep its registry and resident artifacts under the mounted checkout.
  const path = relative(resolve(repositoryRoot, resourcePrefix), directory);
  return path && !path.startsWith("..") && !isAbsolute(path) ? repositoryRoot : directory;
}

async function readResidentState(directory: string): Promise<ResourceState | undefined> {
  const contents = await readOptional(join(directory, "resident.json"));
  if (contents === undefined) return undefined;
  const state = JSON.parse(contents);
  if (
    typeof state?.project !== "string" ||
    !isHybridResidentProject(state.project) ||
    (state.network !== "bridge" && state.network !== "host") ||
    !portNames.every((name) => {
      const port = state.ports?.[name];
      return Number.isInteger(port) && port > 0 && port <= 65_535;
    }) ||
    new Set(portNames.map((name) => state.ports[name])).size !== portNames.length
  ) {
    throw new Error("Invalid E2E resident resource record; preserve it for exact recovery");
  }
  return state;
}

async function withResidentLock<T>(directory: string, worktree: string, use: () => Promise<T>) {
  const lock = await acquireResidentLock(directory, worktree);
  return await runWithCleanup(use, lock.release);
}

async function allocateState(network: HybridNetwork, lifecycle: HybridLifecycle): Promise<ResourceState> {
  const allocated = new Set<number>();
  while (allocated.size < portNames.length) allocated.add(await allocateAvailablePort());
  const [postgres, redis, etcd, http, https, admin] = [...allocated] as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const id = randomUUID().replaceAll("-", "");
  return {
    project: `iam-e2e-${lifecycle === "resident" ? "resident-" : ""}${id}`,
    network,
    ports: { postgres, redis, etcd, http, https, admin },
  };
}

function artifactDirectory(project: string) {
  return `${resourcePrefix}/${project.slice("iam-e2e-".length)}`;
}

async function readRun(root: string, project: string) {
  const run = await readManagedResourceRun(root, `${artifactDirectory(project)}/run.json`);
  if (run.record.project !== project || run.record.composeFile !== `${run.record.artifactDirectory}/compose.json`) {
    throw new Error(`E2E resource record does not name the requested exact project ${project}`);
  }
  return run;
}

async function prepareResidentRun(
  options: MiddlewareOptions,
  directory: string,
  network: HybridNetwork,
  existing: ResourceState | undefined,
) {
  const root = residentResourceRoot(options.repositoryRoot, directory);
  const residentRecord = join(directory, "resident.json");
  if (existing) {
    const run = await readRun(root, existing.project);
    const snapshot = JSON.parse(await readFile(join(root, run.record.composeFile), "utf8"));
    if (!Object.hasOwn(snapshot.volumes ?? {}, "postgres-data")) return { state: existing, run };
    // Retire the previous stack while its Compose snapshot still names its PostgreSQL volume.
    await cleanupManagedResources(run, { timeoutMs: 120_000 });
    await rm(residentRecord);
  }
  const state = await allocateState(network, "resident");
  const run = await registerRun(root, state, options, false);
  await writeAtomicResourceRecord(residentRecord, state);
  return { state, run };
}

async function registerRun(root: string, state: ResourceState, options: MiddlewareOptions, keep: boolean) {
  const artifacts = artifactDirectory(state.project);
  // Persist a valid snapshot before publishing the recovery record.
  await prepareCompose(root, artifacts, options.repositoryRoot, state);
  return await createManagedResourceRun({
    root,
    composeFile: `${artifacts}/compose.json`,
    artifactDirectory: artifacts,
    project: state.project,
    removeLocalImages: true,
    keep,
    composeEnvironment: { COMPOSE_DISABLE_ENV_FILE: "1" },
    registryFile: root === options.repositoryRoot ? process.env.IAM_TEST_RESOURCE_REGISTRY : undefined,
    parentRecord: root === options.repositoryRoot ? process.env.IAM_TEST_RESOURCE_RECORD : undefined,
  });
}

async function prepareCompose(root: string, artifacts: string, repositoryRoot: string, state: ResourceState) {
  const source = join(repositoryRoot, apisixBuildContext);
  const [dockerfile, config] = await Promise.all([
    readFile(join(source, "Dockerfile"), "utf8"),
    readFile(join(source, "apisix.yaml"), "utf8"),
  ]);
  const digest = createHash("sha256").update(dockerfile).update("\0").update(config).digest("hex");
  const context = `${artifacts}/apisix-${digest}`;
  const directory = join(root, context);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, "Dockerfile"), dockerfile),
    writeFile(join(directory, "apisix.yaml"), config),
  ]);
  const snapshot = join(root, artifacts, "compose.json");
  const topology = createHybridCompose({ ...state, buildContext: context });
  if ((await readOptional(snapshot)) === `${JSON.stringify(topology, null, 2)}\n`) return false;
  await writeAtomicResourceRecord(snapshot, topology);
  return true;
}

async function startStack(run: ManagedResourceRun, options: MiddlewareOptions, state: ResourceState) {
  const wasReady = run.record.status === "ready";
  run.record.status = "initializing";
  await saveManagedResourceRun(run);
  const changed = await prepareCompose(run.root, run.record.artifactDirectory, options.repositoryRoot, state);
  const result = await runManagedComposeCommand(
    run,
    ["up", "--detach", "--wait", "--wait-timeout", "60", ...(!wasReady || changed ? ["--build"] : [])],
    {
      timeoutMs: 180_000,
      signal: options.signal,
      logFile: join(run.root, run.record.artifactDirectory, "initialize.log"),
    },
  );
  if (result.exitCode !== 0)
    throw new Error(`E2E middleware ${state.project} did not become healthy:\n${result.output}`);
  run.record.status = "ready";
  await saveManagedResourceRun(run);
}

async function resolveStackConnection(
  run: ManagedResourceRun,
  state: ResourceState,
  upstreamHost: string,
  hostEnvironment: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<HybridMiddleware> {
  const { ports, project, network } = state;
  // PostgreSQL and Redis always run on the Compose bridge network; resolve direct bridge endpoints on Linux/AFK.
  // APISIX uses network_mode: host on Linux/AFK so its admin listener stays on 127.0.0.1:${ports.admin}.
  const [postgres, redis] = await Promise.all([
    managedServiceEndpoint(run, "postgres", 5432, { signal, timeoutMs: 10_000 }),
    managedServiceEndpoint(run, "redis", 6379, { signal, timeoutMs: 10_000 }),
  ]);
  return {
    project,
    composeFile: join(run.root, run.record.composeFile),
    network,
    ports,
    databaseUrl: `postgresql://${e2eDatabaseName}:${e2eDatabasePassword}@${postgres.host}:${postgres.port}/${e2eDatabaseName}`,
    redisUrl: `redis://${redis.host}:${redis.port}/0`,
    apisixAdminUrl: `http://127.0.0.1:${ports.admin}/apisix/admin`,
    upstreamHost,
    hostEnvironment,
    async probeUpstream({ service, port }, signal) {
      const address = new URL(`http://${upstreamHost}:${port}`);
      const message = `APISIX cannot reach ${service} at ${address.href} (project ${project}, ${network} networking)`;
      try {
        const result = await runManagedComposeCommand(
          run,
          [
            "exec",
            "--no-TTY",
            "apisix",
            "timeout",
            "5",
            "bash",
            "-c",
            'exec 3<>"/dev/tcp/$1/$2"',
            "e2e-upstream-probe",
            address.hostname,
            String(port),
          ],
          { signal, timeoutMs: 12_000 },
        );
        if (result.exitCode !== 0) throw new Error(result.output.trim());
      } catch (error) {
        throw new Error(message, { cause: error });
      }
    },
  };
}

async function readOptional(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
