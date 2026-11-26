import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { spawnOwnedProcessTree, waitForOwnedProcessTree } from "@iam/runtime/process";
import { runCommand } from "../../src/command-runner.ts";
import { readHybridRunContext } from "../../src/hybrid-context.ts";
import { cleanupHybridResident } from "../../src/hybrid-middleware.ts";
import { withHybridRuntime } from "../../src/hybrid-runtime.ts";

const workspaceRoot = resolve(import.meta.dir, "../..");
const repositoryRoot = resolve(workspaceRoot, "../..");
const require = createRequire(import.meta.url);
const playwright = join(dirname(require.resolve("@playwright/test/package.json")), "cli.js");
const integrationArtifacts = join(repositoryRoot, "test-results/integration");

test("takes over a crashed resident runtime only after its detached services have stopped", async () => {
  await mkdir(integrationArtifacts, { recursive: true });
  const directory = await mkdtemp(join(integrationArtifacts, "hybrid-crash-"));
  const ready = join(directory, "context-path");
  const launchScript = join(directory, "runtime.ts");
  const options = {
    repositoryRoot,
    artifactRoot: directory,
    lifecycle: "resident",
    residentDirectory: directory,
    devFrontend: true,
  } as const;
  await writeFile(
    launchScript,
    `
      import { writeFile } from "node:fs/promises";
      import { withHybridRuntime } from "../../../e2e/system/src/hybrid-runtime.ts";
      await withHybridRuntime(${JSON.stringify(options)}, async (contextPath) => {
        await writeFile(${JSON.stringify(ready)}, contextPath + "\\n");
        await Bun.sleep(120000);
      });
    `,
  );
  // An owned launcher here would stop detached descendants on leader exit, masking the crash.
  const child = spawn(process.execPath, ["--no-env-file", launchScript], { cwd: workspaceRoot, stdio: "inherit" });
  const exited = new Promise<string | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (_code, signal) => resolve(signal));
  });
  try {
    const path = await Promise.race([
      waitForContextPath(ready, AbortSignal.timeout(120_000)),
      exited.then(() => {
        throw new Error("Hybrid runtime crashed before readiness");
      }),
    ]);
    const old = await readHybridRunContext(path);
    child.kill("SIGKILL");
    const signal = await exited;
    expect(signal).toBe("SIGKILL");
    const nextRun = await withHybridRuntime({ ...options, devFrontend: false }, async (nextPath) => {
      const next = await readHybridRunContext(nextPath);
      expect(next.project).toBe(old.project);
      expect(next.references.adminSubjectIdentifier).toBe(old.references.adminSubjectIdentifier);
      await expectHostServicesStopped(old);
      const healthy = await fetch(`${next.backendOrigins.worker}/healthz`);
      expect(healthy.status).toBe(200);
      await healthy.body?.cancel();
      return dirname(nextPath);
    });
    const profile = JSON.parse(await readFile(join(nextRun, "host-memory.json"), "utf8"));
    expect(profile).toMatchObject({ version: 1, platform: "linux", source: "os.freemem", intervalMs: 250 });
    expect(profile.stages.map(({ stage }: { stage: string }) => stage)).toEqual([
      "infrastructure",
      "migration",
      "seed",
      "build",
      "application-startup",
      "gateway-readiness",
      "browser",
      "cleanup",
    ]);
    for (const stage of profile.stages) {
      expect(Date.parse(stage.endedAt)).toBeGreaterThanOrEqual(Date.parse(stage.startedAt));
      expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      expect(stage.samples).toBeGreaterThanOrEqual(2);
      expect(stage.minFreePhysicalBytes).toBeGreaterThanOrEqual(0);
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await exited;
    await cleanupHybridResident(options);
    await rm(directory, { recursive: true, force: true });
  }
}, 240_000);

test("real Playwright file switches restore PG and Redis and the Worker can stop independently", async () => {
  const root = join(workspaceRoot, "test-results");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "hybrid-test-"));
  try {
    let context: Awaited<ReturnType<typeof readHybridRunContext>> | undefined;
    await withHybridRuntime({ repositoryRoot, artifactRoot: directory, fresh: true }, async (contextPath, signal) => {
      context = await readHybridRunContext(contextPath);
      const config = join(directory, "playwright.config.ts");
      await writeFile(
        config,
        `export default { testDir: ".", outputDir: "playwright-output", workers: 1, timeout: 120000 };`,
      );
      const shared = `
        import { execFileSync } from "node:child_process";
        import { expect } from "@playwright/test";
        import { test } from "../../src/gateway-test.ts";
        import { requestHybridControl, readHybridRunContext } from "../../src/hybrid-context.ts";
        async function runtime() {
          return readHybridRunContext(process.env.IAM_E2E_CONTEXT_PATH);
        }
        function state(command) {
          return execFileSync(process.env.IAM_E2E_TEST_BUN, ["state.ts", command], {
            cwd: ${JSON.stringify(directory)}, env: process.env, encoding: "utf8",
          }).trim();
        }
      `;
      await writeFile(
        join(directory, "state.ts"),
        `import { SQL } from "bun";
         import Redis from "ioredis";
         import { readHybridRunContext } from "../../src/hybrid-context.ts";
         const context = await readHybridRunContext(process.env.IAM_E2E_CONTEXT_PATH);
         const pg = new SQL({ url: context.databaseUrl, max: 1 });
         const redis = new Redis(context.redisUrl);
         try {
           if (process.argv[2] === "dirty") {
             await pg.unsafe("CREATE TABLE e2e_cross_file_dirty (note text)");
             await redis.set("e2e:cross-file:dirty", "stale");
           } else {
             const [row] = await pg.unsafe("SELECT to_regclass('e2e_cross_file_dirty') IS NOT NULL AS dirty");
             console.log(JSON.stringify([row.dirty, await redis.get("e2e:cross-file:dirty")]));
           }
         } finally {
           await pg.close();
           redis.disconnect();
         }`,
      );
      await writeFile(
        join(directory, "a.spec.ts"),
        shared +
          `test("starts on the seed baseline and leaves dirty state", async ({ request }, testInfo) => {
             const first = await runtime();
             expect(first.resetCount).toBe(1);
             if (testInfo.retry) {
               expect(state("read")).toBe('[true,"stale"]');
               return;
             }
             expect(state("read")).toBe('[false,null]');
             const response = await request.get(first.origin + "/e2e/oidc/callback");
             expect(response.status()).toBe(200);
             const denied = await fetch(first.control.origin + "/worker/stop", { method: "POST" });
             expect(denied.status).toBe(401);
             await requestHybridControl(first, "/worker/stop");
             expect(await fetch(first.backendOrigins.worker + "/healthz").catch(() => undefined)).toBeUndefined();
             expect((await fetch(first.backendOrigins["gateway-api"] + "/health")).status).toBe(200);
             await requestHybridControl(first, "/worker/start");
             expect((await fetch(first.backendOrigins.worker + "/healthz")).status).toBe(200);
             state("dirty");
             throw new Error("exercise Playwright worker replacement");
           });
           test("preserves same-file state in subsequent tests", async () => {
             expect((await runtime()).resetCount).toBe(1);
             expect(state("read")).toBe('[true,"stale"]');
           });`,
      );
      await writeFile(
        join(directory, "b.spec.ts"),
        shared +
          `test("clones PG and restores Redis at the next file", async ({ request }) => {
             expect(state("read")).toBe('[false,null]');
             const reset = await runtime();
             expect(reset.resetCount).toBe(2);
             expect(reset.references.adminSubjectIdentifier).toBe(${JSON.stringify(context.references.adminSubjectIdentifier)});
             for (const service of ["auth-api", "sso-api", "integration-api"]) {
               const ready = await request.get(reset.backendOrigins[service] + "/ready");
               expect(ready.status()).toBe(200);
             }
             const health = await request.get(reset.internalOrigin + "/oidc/.well-known/openid-configuration");
             expect(health.status()).toBe(200);
           });`,
      );
      for (const service of ["auth-api", "sso-api", "integration-api", "admin-api", "worker", "gateway-api"]) {
        const logs = await readFile(join(context.logDirectory, `${service}.stdout.log`), "utf8");
        expect(logs.length).toBeGreaterThan(0);
      }
      await runCommand("node", [playwright, "test", "--config", config, "--reporter=line", "--retries=1"], {
        cwd: workspaceRoot,
        env: { ...process.env, IAM_E2E_CONTEXT_PATH: contextPath, IAM_E2E_TEST_BUN: process.execPath },
        signal,
        inheritOutput: true,
      });
    });
    if (!context) throw new Error("Hybrid runtime context was not published");
    await expectHostServicesStopped(context);
    const gateway = await fetch(context.origin.replace("external.iam.localhost", "127.0.0.1")).catch(() => undefined);
    expect(gateway).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 260_000);

test("SIGTERM stops backends and Vite and releases the resident lock", async () => {
  await mkdir(integrationArtifacts, { recursive: true });
  const directory = await mkdtemp(join(integrationArtifacts, "hybrid-signal-"));
  const readyFile = join(directory, "context-path");
  const childOwns = new AbortController();
  const launchScript = join(directory, "runtime.ts");
  await writeFile(
    launchScript,
    `import { writeFile } from "node:fs/promises";
     import { setTimeout } from "node:timers/promises";
     import { withHybridRuntime } from "../../../e2e/system/src/hybrid-runtime.ts";
     try {
       await withHybridRuntime(${JSON.stringify({
         repositoryRoot,
         artifactRoot: directory,
         lifecycle: "resident",
         devFrontend: true,
         residentDirectory: directory,
       })}, async (contextPath, signal) => {
         await writeFile(${JSON.stringify(readyFile)}, contextPath + "\\n");
         await setTimeout(120000, undefined, { signal });
       });
     } catch (error) {
       console.error(error);
       process.exitCode = 1;
     }`,
  );
  const child = spawnOwnedProcessTree({
    executable: process.execPath,
    args: ["--no-env-file", launchScript],
    cwd: workspaceRoot,
    env: process.env,
  });
  const finished = waitForOwnedProcessTree(child, { signal: childOwns.signal, timeoutMs: 180_000 });
  child.stdout.resume();
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-8_192);
  });
  try {
    const path = await Promise.race([
      waitForContextPath(readyFile, AbortSignal.timeout(120_000)),
      finished.then(() => {
        throw new Error(`Hybrid runtime exited before readiness\n${diagnostics}`);
      }),
    ]);
    const context = await readHybridRunContext(path);
    child.kill("SIGTERM");
    const outcome = await finished;
    expect(outcome.outcome).toEqual({ exitCode: 1, signal: null });
    expect(outcome.cleanupFailure).toBeUndefined();
    const artifactDirectory = dirname(path);
    const profile: { stages: { stage: string; startedAt: string; endedAt: string }[] } = JSON.parse(
      await readFile(join(artifactDirectory, "host-memory.json"), "utf8"),
    );
    expect(profile.stages.at(-1)).toMatchObject({ stage: "cleanup", endedAt: expect.any(String) });
    const seed = profile.stages.find(({ stage }) => stage === "seed");
    if (!seed) throw new Error("Cold runtime profile omitted the seed stage");
    for (const log of ["template-seed.log", "template-worker.log"]) {
      const { mtimeMs } = await stat(join(artifactDirectory, log));
      const lastWrite = Math.floor(mtimeMs);
      expect(lastWrite).toBeGreaterThanOrEqual(Date.parse(seed.startedAt));
      expect(lastWrite).toBeLessThanOrEqual(Date.parse(seed.endedAt));
    }
    expect(context.frontendOrigins.admin).not.toBe(context.frontendOrigins.sso);
    await expectHostServicesStopped(context);
    const gateway = await fetch(context.origin.replace("external.iam.localhost", "127.0.0.1"));
    expect(gateway.status).toBe(404);
    await gateway.body?.cancel();
  } finally {
    childOwns.abort();
    await finished;
    await cleanupHybridResident({ repositoryRoot, residentDirectory: directory });
    await rm(directory, { recursive: true, force: true });
  }
}, 200_000);

async function waitForContextPath(file: string, signal: AbortSignal) {
  while (true) {
    const value = await readFile(file, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (value.endsWith("\n")) return value.trimEnd();
    await setTimeout(50, undefined, { signal });
  }
}

async function expectHostServicesStopped(context: Awaited<ReturnType<typeof readHybridRunContext>>) {
  for (const origin of [
    ...Object.values(context.backendOrigins),
    ...new Set(Object.values(context.frontendOrigins)),
    context.control.origin,
  ]) {
    const response = await fetch(origin).catch(() => undefined);
    expect(response).toBeUndefined();
  }
}
