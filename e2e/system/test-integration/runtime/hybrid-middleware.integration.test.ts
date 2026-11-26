import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  cleanupManagedResources,
  readManagedResourceRun,
} from "../../../../scripts/test-resources/managed-resources.mjs";
import { runOwnedCommand } from "../../../../scripts/test-resources/owned-command.mjs";
import { cleanupHybridResident, withHybridMiddleware } from "../../src/hybrid-middleware.ts";
import { apisixAdminKey, apisixErrorLog } from "../../src/middleware-compose.ts";

const repositoryRoot = resolve(import.meta.dir, "../../../..");

async function dockerRead(args: string[]) {
  const result = await runOwnedCommand({
    executable: "docker",
    args,
    cwd: repositoryRoot,
    timeoutMs: 10_000,
  });
  if (result.exitCode !== 0) throw new Error(result.output);
  return result.output.trim();
}

async function ownedContainers(project: string) {
  const result = await dockerRead([
    "ps",
    "--all",
    "--quiet",
    "--filter",
    `label=com.docker.compose.project=${project}`,
  ]);
  return result.split("\n").filter(Boolean).sort();
}

async function ownedVolumes(project: string) {
  const result = await dockerRead([
    "volume",
    "ls",
    "--quiet",
    "--filter",
    `label=com.docker.compose.project=${project}`,
  ]);
  return result.split("\n").filter(Boolean).sort();
}

test("fresh host middleware exposes APISIX over DooD and removes its exact project after failure", async () => {
  const upstream = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("upstream") });
  const port = upstream.port;
  const scenarioFailure = new Error("Synthetic E2E scenario failure");
  let project = "";
  try {
    if (port === undefined) throw new Error("Test upstream did not bind a port");
    const failure = await withHybridMiddleware({ repositoryRoot, lifecycle: "fresh" }, async (stack) => {
      project = stack.project;
      const containers = await ownedContainers(project);
      expect(containers).toHaveLength(4);
      const inspected: Array<{ Mounts: Array<{ Type: string }> }> = JSON.parse(
        await dockerRead(["inspect", ...containers]),
      );
      expect(inspected.flatMap((container) => container.Mounts).some((mount) => mount.Type === "bind")).toBe(false);
      const http = await fetch(`http://127.0.0.1:${stack.ports.http}/`);
      expect(http.status).toBe(404);
      const tlsListener = await fetch(`http://127.0.0.1:${stack.ports.https}/`);
      expect(tlsListener.status).toBe(400);
      const admin = await fetch(`${stack.apisixAdminUrl}/routes`, { headers: { "X-API-KEY": apisixAdminKey } });
      expect(admin.status).toBe(200);
      const probe = await stack.probeUpstream({ service: "API", port });
      expect(probe).toBeUndefined();
      await upstream.stop(true);
      const error = await stack.probeUpstream({ service: "API", port }).catch((cause: unknown) => cause);
      expect(error).toMatchObject({ message: expect.stringContaining("APISIX cannot reach API") });
      const route = await fetch(`${stack.apisixAdminUrl}/routes/failure-evidence`, {
        method: "PUT",
        headers: { "X-API-KEY": apisixAdminKey, "content-type": "application/json" },
        body: JSON.stringify({
          uri: "/failure-evidence",
          upstream: { type: "roundrobin", nodes: { [`127.0.0.1:${port}`]: 1 } },
        }),
      });
      expect(route.ok).toBe(true);
      const failed = await fetch(`http://127.0.0.1:${stack.ports.http}/failure-evidence?value=synthetic-query`);
      expect(failed.status).toBe(502);
      const gateway = await dockerRead([
        "ps",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${project}`,
        "--filter",
        "label=com.docker.compose.service=apisix",
      ]);
      const logs = await dockerRead(["logs", gateway]);
      expect(logs).not.toContain("synthetic-query");
      const privateErrors = await dockerRead(["exec", gateway, "tail", "-n", "50", apisixErrorLog]);
      expect(privateErrors).toMatch(/\[error\].*while connecting to upstream.*\/failure-evidence/u);
      throw scenarioFailure;
    }).catch((error: unknown) => error);
    expect(failure).toBe(scenarioFailure);
    const remaining = await ownedContainers(project);
    expect(remaining).toEqual([]);
    const volumes = await ownedVolumes(project);
    expect(volumes).toEqual([]);
    const networks = await dockerRead([
      "network",
      "ls",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ]);
    expect(networks).toBe("");
  } finally {
    await upstream.stop(true);
  }
}, 220_000);

test("resident middleware survives calls and cleanup shares the cross-worktree lease", async () => {
  const resources = join(repositoryRoot, "test-results/integration");
  await mkdir(resources, { recursive: true });
  const residentDirectory = await mkdtemp(join(resources, "e2e-resident-test-"));
  const options = { repositoryRoot, residentDirectory, lifecycle: "resident" } as const;
  try {
    const first = await withHybridMiddleware(options, async (stack) => {
      const conflict = await cleanupHybridResident(options).catch((error: unknown) => error);
      expect(conflict).toMatchObject({ message: expect.stringContaining(`PID ${process.pid}`) });
      return { project: stack.project, containers: await ownedContainers(stack.project), ports: stack.ports };
    });
    expect(first.containers).toHaveLength(4);
    const second = await withHybridMiddleware(options, async (stack) => ({
      project: stack.project,
      containers: await ownedContainers(stack.project),
      ports: stack.ports,
    }));
    expect(second).toEqual(first);
    await cleanupHybridResident({ ...options, project: first.project });
    const remaining = await ownedContainers(first.project);
    expect(remaining).toEqual([]);
  } finally {
    await cleanupHybridResident(options);
    await rm(residentDirectory, { recursive: true, force: true });
  }
}, 220_000);

test("fresh keep retains only its own separately allocated resources until exact cleanup", async () => {
  let recordPath: string | undefined;
  let retainedProject: string | undefined;
  let disposableProject: string | undefined;
  try {
    await withHybridMiddleware({ repositoryRoot, fresh: true }, async (disposable) => {
      disposableProject = disposable.project;
      await withHybridMiddleware({ repositoryRoot, fresh: true, keep: true }, async (retained) => {
        retainedProject = retained.project;
        recordPath = `test-results/integration/${retained.project.slice("iam-e2e-".length)}/run.json`;
        expect(retained.project).not.toBe(disposable.project);
        const used = new Set(Object.values(disposable.ports));
        expect(Object.values(retained.ports).some((port) => used.has(port))).toBe(false);
        for (const stack of [disposable, retained]) {
          const admin = await fetch(`${stack.apisixAdminUrl}/routes`, {
            headers: { "X-API-KEY": apisixAdminKey },
            signal: AbortSignal.timeout(5_000),
          });
          await admin.body?.cancel();
          expect(admin.status).toBe(200);
        }
      });
    });
    if (!recordPath || !disposableProject || !retainedProject) throw new Error("Missing exact test resource records");
    const retained = await readManagedResourceRun(repositoryRoot, recordPath);
    expect(retained.record.status).toBe("kept");
    expect(retained.record.project).toBe(retainedProject);
    const retainedContainers = await ownedContainers(retainedProject);
    const retiredContainers = await ownedContainers(disposableProject);
    expect(retainedContainers).toHaveLength(4);
    expect(retiredContainers).toEqual([]);
    await cleanupManagedResources(retained);
    const remaining = await ownedContainers(retainedProject);
    expect(remaining).toEqual([]);
  } finally {
    if (recordPath) await cleanupManagedResources(await readManagedResourceRun(repositoryRoot, recordPath));
  }
}, 280_000);
