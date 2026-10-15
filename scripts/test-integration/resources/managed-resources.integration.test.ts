import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readManagedResourceRegistry } from "../../test-resources/managed-resources.mjs";
import { dockerCliEnvironment } from "../docker/docker-cli-fixture";
import { runOwnedCommand, withCommandFixture } from "../harness/command-fixture";

const repoRoot = join(import.meta.dirname, "../../..");
const entry = join(repoRoot, "scripts/run-test-integration.mjs");

async function createWorkspaceFixture(directory: string) {
  const root = join(directory, "workspace");
  await mkdir(join(root, "scripts/test-resources"), { recursive: true });
  await copyFile(
    join(repoRoot, "scripts/test-resources/compose.yaml"),
    join(root, "scripts/test-resources/compose.yaml"),
  );
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@fixture/root", private: true }));
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: ['apps/*']\n");
  for (const [directory, name, executor, resources] of [
    ["worker", "@iam/worker", "bun", { redis: "IAM_WORKER_TEST_REDIS_URL" }],
    ["sso", "@iam/sso", "playwright", {}],
    ["database", "@fixture/postgres", "bun", { postgres: "IAM_WORKER_TEST_DATABASE_URL" }],
  ] as const) {
    const owner = join(root, "apps", directory);
    await mkdir(join(owner, "test-integration/workflows"), { recursive: true });
    await writeFile(
      join(owner, "package.json"),
      JSON.stringify({
        name,
        iamTest: { integration: { [executor]: resources } },
        scripts: { [`test:integration:${executor}`]: "controlled runner" },
      }),
    );
    await writeFile(
      join(owner, `test-integration/workflows/selected.${executor === "playwright" ? "spec" : "integration.test"}.ts`),
      "",
    );
  }
  return root;
}

function withManagedCommandFixture<T>(prefix: string, run: (root: string, signal: AbortSignal) => Promise<T>) {
  // Observe the nested deadline plus its independent diagnostics and cleanup before finalizing.
  return withCommandFixture(prefix, run, { scenarioTimeoutMs: 35_000 });
}

function managedDockerEnvironment(): NodeJS.ProcessEnv {
  return { ...dockerCliEnvironment(), IAM_TEST_RESOURCE_REGISTRY: process.env.IAM_TEST_RESOURCE_REGISTRY };
}

async function assertNoProjectResources(project: string, signal: AbortSignal) {
  const inventories = await Promise.all(
    [
      ["ps", "-aq"],
      ["network", "ls", "-q"],
      ["volume", "ls", "-q"],
    ].map((args) =>
      runOwnedCommand(
        ["docker", ...args, "--filter", `label=com.docker.compose.project=${project}`],
        repoRoot,
        signal,
        10_000,
        managedDockerEnvironment(),
      ),
    ),
  );
  for (const inventory of inventories) expect(inventory).toEqual({ exitCode: 0, output: "(no output captured)" });
}

test("root prepares only Redis, injects its ready address and destroys its exact project", async () => {
  await withManagedCommandFixture("iam-managed-resources-", async (directory, signal) => {
    const repoRoot = await createWorkspaceFixture(directory);
    const log = join(directory, "execution.json");
    const registry =
      process.env.IAM_TEST_RESOURCE_REGISTRY ?? `test-results/integration/registry-${randomUUID()}.jsonl`;
    const recorder = join(directory, "pnpm.mjs");
    await writeFile(
      recorder,
      `
      import { writeFileSync } from "node:fs";
      import { createConnection } from "node:net";
      const url = new URL(process.env.IAM_WORKER_TEST_REDIS_URL);
      const socket = createConnection({host: url.hostname, port: Number(url.port)});
      socket.setTimeout(3000, () => { throw new Error("Redis did not reply"); });
      socket.on("connect", () => socket.write("*1\\r\\n$4\\r\\nPING\\r\\n"));
      socket.once("data", (reply) => {
        if (!reply.toString().startsWith("+PONG")) throw new Error("Redis is not ready");
        writeFileSync(process.env.RECORDER_LOG, JSON.stringify({runId: process.env.IAM_TEST_RESOURCE_RUN_ID,
          record: process.env.IAM_TEST_RESOURCE_RECORD, redis: url.href, args: process.argv.slice(2)}));
        socket.end();
      });
    `,
    );
    const result = await runOwnedCommand(
      [
        "node",
        entry,
        "--workspace",
        "@iam/worker",
        "--file",
        "apps/worker/test-integration/workflows/selected.integration.test.ts",
      ],
      repoRoot,
      signal,
      25_000,
      {
        ...managedDockerEnvironment(),
        npm_execpath: recorder,
        RECORDER_LOG: log,
        IAM_TEST_RESOURCE_REGISTRY: registry,
        IAM_WORKER_TEST_REDIS_URL: "redis://caller.invalid:1/0",
      },
    );
    expect(result.exitCode, result.output).toBe(0);
    const execution = JSON.parse(await readFile(log, "utf8"));
    const record = JSON.parse(await readFile(join(repoRoot, execution.record), "utf8"));
    expect(record).toMatchObject({ runId: execution.runId, services: ["redis"], status: "cleaned" });
    expect((await readFile(join(repoRoot, registry), "utf8")).trim().split("\n")).toContain(
      JSON.stringify(execution.record),
    );
    expect(execution.redis).toMatch(/^redis:\/\/127\.0\.0\.1:\d+\/0$/);
    await assertNoProjectResources(record.project, signal);
  });
}, 45_000);

test("normal completion closes a stdio-ignore descendant before the outer fixture finalizer runs", async () => {
  await withManagedCommandFixture("iam-normal-descendant-", async (directory, signal) => {
    const repoRoot = await createWorkspaceFixture(directory);
    const recorder = join(directory, "pnpm.mjs");
    const server = join(directory, "server.mjs");
    const information = join(directory, "server.json");
    await writeFile(
      server,
      `import { createServer } from "node:net"; import { writeFileSync } from "node:fs";
      const server = createServer(); server.listen(0, "127.0.0.1", () => writeFileSync(${JSON.stringify(information)}, JSON.stringify({pid: process.pid, port: server.address().port})));`,
    );
    await writeFile(
      recorder,
      `import { spawn } from "node:child_process"; import { existsSync } from "node:fs";
      spawn(process.execPath, [${JSON.stringify(server)}], {stdio: "ignore", detached: true}).unref();
      for (let attempt = 0; attempt < 100 && !existsSync(${JSON.stringify(information)}); attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
      if (!existsSync(${JSON.stringify(information)})) throw new Error("Descendant did not become ready"); process.exit(0);`,
    );
    const controller = join(directory, "controller.mjs");
    // Observe inside a native Node controller, before either Bun's child Job or the outer smoke Job closes.
    await writeFile(
      controller,
      `import { spawn } from "node:child_process"; import { readFile } from "node:fs/promises"; import { createConnection } from "node:net";
      const child = spawn(process.execPath, ${JSON.stringify([entry, "--workspace", "@iam/worker"])}, {cwd: ${JSON.stringify(repoRoot)}, env: {...process.env, npm_execpath: ${JSON.stringify(recorder)}}, stdio: ["ignore", "pipe", "pipe"]});
      let output = ""; child.stdout.on("data", (chunk) => {output += chunk;}); child.stderr.on("data", (chunk) => {output += chunk;});
      let timer; let descendant;
      try {
        const code = await new Promise((resolve, reject) => {child.once("error", reject); child.once("close", resolve); timer = setTimeout(() => reject(new Error("Root command did not complete: " + output)), 25000);});
        if (code !== 0) throw new Error("Root command failed: " + output);
        descendant = JSON.parse(await readFile(${JSON.stringify(information)}, "utf8"));
        const listening = await new Promise((resolve) => {const socket = createConnection({host: "127.0.0.1", port: descendant.port}); socket.once("connect", () => {socket.destroy(); resolve(true);}); socket.once("error", () => {socket.destroy(); resolve(false);}); socket.setTimeout(1000, () => {socket.destroy(); resolve(false);});});
        if (listening) throw new Error("Root left its stdio-ignore descendant listening");
        console.log("DESCENDANT_CLOSED");
      } catch (error) {console.error(error.message); process.exitCode = 1;}
      finally {clearTimeout(timer); child.kill(); descendant ??= JSON.parse(await readFile(${JSON.stringify(information)}, "utf8").catch(() => "null")); if (descendant) {try {process.kill(descendant.pid, "SIGTERM");} catch (error) {if (error.code !== "ESRCH") throw error;}}}`,
    );
    const result = await runOwnedCommand(["node", controller], repoRoot, signal, 27_000, managedDockerEnvironment());
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain("DESCENDANT_CLOSED");
  });
}, 45_000);

test("partial initialization preserves diagnostics and cleans the recorded project before any test starts", async () => {
  await withManagedCommandFixture("iam-partial-initialization-", async (directory, signal) => {
    const repoRoot = await createWorkspaceFixture(directory);
    const compose = `services:
  redis:
    image: redis:8.8.0-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 1s
      timeout: 2s
      retries: 10
  broken:
    image: redis:8.8.0-alpine
    command: ["redis-cli", "--invalid-fixture-option"]
    depends_on:
      redis:
        condition: service_healthy
`;
    const composePath = `test-results/integration/partial-${randomUUID()}.yaml`;
    await mkdir(join(repoRoot, "test-results/integration"), { recursive: true });
    await writeFile(join(repoRoot, composePath), compose);
    const driver = join(directory, "owner.mjs");
    const recordFile = join(directory, "record.txt");
    const module = pathToFileURL(join(import.meta.dirname, "../../test-resources/managed-resources.mjs")).href;
    await writeFile(
      driver,
      `import { writeFileSync } from "node:fs";
      import { createManagedResourceRun, startManagedResources, finishManagedResourceRun, formatResourceFailure } from ${JSON.stringify(module)};
      const run = await createManagedResourceRun({root: process.cwd(), composeFile: ${JSON.stringify(composePath)}, services: ["redis", "broken"], registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY});
      writeFileSync(${JSON.stringify(recordFile)}, run.recordPath);
      try { await startManagedResources(run, {timeoutMs: 10000}); console.log("TEST STARTED"); }
      catch (error) { console.error(formatResourceFailure(error)); process.exitCode = 1; }
      finally { await finishManagedResourceRun(run); }`,
    );
    const result = await runOwnedCommand(["node", driver], repoRoot, signal, 25_000, managedDockerEnvironment());
    expect(result.exitCode, result.output).toBe(1);
    expect(result.output).toContain("Resource initialization failed");
    expect(result.output).not.toContain("TEST STARTED");
    const recordPath = (await readFile(recordFile, "utf8")).trim();
    const record = JSON.parse(await readFile(join(repoRoot, recordPath), "utf8"));
    expect(record.status).toBe("cleaned");
    const diagnostics = await readFile(join(repoRoot, record.artifactDirectory, "containers.log"), "utf8");
    expect(diagnostics).toContain('"healthy"');
    expect(diagnostics).toContain('"broken"');
    const remaining = await runOwnedCommand(
      ["docker", "ps", "-aq", "--filter", `label=com.docker.compose.project=${record.project}`],
      directory,
      signal,
      10_000,
      managedDockerEnvironment(),
    );
    expect(remaining.output).toBe("(no output captured)");
  });
}, 45_000);

async function isListening(port: number) {
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

test.each(["timeout", "interrupt"] as const)(
  "%s joins the owned process tree before destroying resources and never starts the next executor",
  async (mode) => {
    await withManagedCommandFixture(`iam-managed-${mode}-`, async (directory, signal) => {
      const repoRoot = await createWorkspaceFixture(directory);
      const recorder = join(directory, "pnpm.mjs");
      const wrapper = join(directory, "entry.mjs");
      const portFile = join(directory, "child-port.txt");
      const log = join(directory, "execution.jsonl");
      const server = `const { createServer } = require("node:net"); const { writeFileSync } = require("node:fs");
      const server = createServer(); server.listen(0, "127.0.0.1", () => writeFileSync(${JSON.stringify(portFile)}, String(server.address().port)));`;
      await writeFile(
        recorder,
        `import { appendFileSync } from "node:fs"; import { spawn } from "node:child_process";
      appendFileSync(process.env.RECORDER_LOG, JSON.stringify({record: process.env.IAM_TEST_RESOURCE_RECORD, args: process.argv.slice(2)}) + "\\n");
      spawn(process.execPath, ["-e", ${JSON.stringify(server)}], {stdio: "ignore", detached: true}).unref(); setInterval(() => {}, 1000);`,
      );
      const args = [
        "--workspace",
        "@iam/worker",
        "--workspace",
        "@iam/sso",
        "--file",
        "apps/worker/test-integration/workflows/selected.integration.test.ts",
        "--file",
        "apps/sso/test-integration/workflows/selected.spec.ts",
        "--timeout-ms",
        "15000",
      ];
      await writeFile(
        wrapper,
        `import { existsSync } from "node:fs";
      ${mode === "interrupt" ? `const timer = setInterval(() => { if (existsSync(${JSON.stringify(portFile)})) { clearInterval(timer); process.emit("SIGTERM"); } }, 20);` : ""}
      process.argv = [process.execPath, ${JSON.stringify(entry)}, ...${JSON.stringify(args)}];
      await import(${JSON.stringify(pathToFileURL(entry).href)});`,
      );
      const result = await runOwnedCommand(["node", wrapper], repoRoot, signal, 30_000, {
        ...managedDockerEnvironment(),
        npm_execpath: recorder,
        RECORDER_LOG: log,
      });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain(
        mode === "timeout" ? "Integration deadline exceeded" : "Integration interrupted by SIGTERM",
      );
      const executions = (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(executions).toHaveLength(1);
      expect(executions[0].args).toContain("test:integration:bun");
      const record = JSON.parse(await readFile(join(repoRoot, executions[0].record), "utf8"));
      expect(record.status).toBe("cleaned");
      const stillListening = await isListening(Number(await readFile(portFile, "utf8")));
      expect(stillListening).toBe(false);
    });
  },
  45_000,
);

test("parallel commands retain independent projects and record recovery does not affect the other run", async () => {
  await withManagedCommandFixture("iam-kept-parallel-", async (directory, signal) => {
    const repoRoot = await createWorkspaceFixture(directory);
    const recorder = join(directory, "pnpm.mjs");
    const registry =
      process.env.IAM_TEST_RESOURCE_REGISTRY ?? `test-results/integration/parallel-registry-${randomUUID()}.jsonl`;
    await writeFile(
      recorder,
      `import { writeFileSync } from "node:fs";
      writeFileSync(process.env.RECORDER_LOG, JSON.stringify({record: process.env.IAM_TEST_RESOURCE_RECORD, runId: process.env.IAM_TEST_RESOURCE_RUN_ID, url: process.env.IAM_WORKER_TEST_REDIS_URL}));`,
    );
    const logs = [join(directory, "first.json"), join(directory, "second.json")];
    const executions = await Promise.all(
      logs.map((log) =>
        runOwnedCommand(["node", entry, "--workspace", "@iam/worker", "--keep-resources"], repoRoot, signal, 25_000, {
          ...managedDockerEnvironment(),
          npm_execpath: recorder,
          RECORDER_LOG: log,
          IAM_TEST_RESOURCE_RUN_ID: "outer-run",
          IAM_TEST_RESOURCE_RECORD: "outer/invalid.json",
          IAM_WORKER_TEST_REDIS_URL: "redis://outer.invalid:1/0",
          IAM_TEST_RESOURCE_REGISTRY: registry,
        }),
      ),
    );
    for (const execution of executions) {
      expect(execution.exitCode, execution.output).toBe(0);
      expect(execution.output).toContain("Environment retained; cleanup: pnpm test:resources:cleanup --record");
    }
    const contexts = await Promise.all(
      logs.map(async (log) => {
        const execution = JSON.parse(await readFile(log, "utf8"));
        const record = JSON.parse(await readFile(join(repoRoot, execution.record), "utf8"));
        return { ...execution, project: record.project, status: record.status };
      }),
    );
    const failures: unknown[] = [];
    try {
      const registeredRecords = await readManagedResourceRegistry(repoRoot, registry);
      for (const context of contexts) expect(registeredRecords).toContain(context.record);
      expect(new Set(contexts.map((context) => context.runId)).size).toBe(2);
      expect(new Set(contexts.map((context) => context.project)).size).toBe(2);
      expect(new Set(contexts.map((context) => context.url)).size).toBe(2);
      expect(contexts.map((context) => context.status)).toEqual(["kept", "kept"]);
      const cleanup = await runOwnedCommand(
        ["node", join(import.meta.dirname, "../../run-test-resource-cleanup.mjs"), "--record", contexts[0].record],
        repoRoot,
        signal,
        10_000,
        managedDockerEnvironment(),
      );
      expect(cleanup.exitCode, cleanup.output).toBe(0);
      const remaining = await runOwnedCommand(
        ["docker", "ps", "-q", "--filter", `label=com.docker.compose.project=${contexts[1].project}`],
        repoRoot,
        signal,
        10_000,
        managedDockerEnvironment(),
      );
      const id = remaining.output.replace("[stdout] ", "").trim();
      expect(id).toMatch(/^[a-f0-9]+$/);
      const alive = await runOwnedCommand(
        ["docker", "exec", id, "redis-cli", "ping"],
        repoRoot,
        signal,
        10_000,
        managedDockerEnvironment(),
      );
      expect(alive.output).toContain("PONG");
    } catch (error) {
      failures.push(error);
    }
    const cleanups = await Promise.allSettled(
      contexts.map((context) =>
        runOwnedCommand(
          ["node", join(import.meta.dirname, "../../run-test-resource-cleanup.mjs"), "--record", context.record],
          repoRoot,
          new AbortController().signal,
          10_000,
          managedDockerEnvironment(),
        ),
      ),
    );
    for (const cleanup of cleanups) {
      if (cleanup.status === "rejected") failures.push(cleanup.reason);
      else if (cleanup.value.exitCode !== 0)
        failures.push(new Error(`Parallel fixture resource cleanup failed: ${cleanup.value.output}`));
    }
    if (failures.length > 0)
      throw new AggregateError(failures, "Parallel fixture execution or resource cleanup failed");
  });
}, 45_000);

test("a passed command keeps its result when auxiliary diagnostics cannot be written", async () => {
  await withManagedCommandFixture("iam-diagnostic-warning-", async (directory, signal) => {
    const repoRoot = await createWorkspaceFixture(directory);
    const recorder = join(directory, "pnpm.mjs");
    const log = join(directory, "record.txt");
    await writeFile(
      recorder,
      `import { readFileSync, writeFileSync, mkdirSync } from "node:fs"; import { join } from "node:path";
      const path = process.env.IAM_TEST_RESOURCE_RECORD; const record = JSON.parse(readFileSync(path, "utf8"));
      writeFileSync(process.env.RECORDER_LOG, path); mkdirSync(join(record.artifactDirectory, "containers.log"));`,
    );
    const result = await runOwnedCommand(["node", entry, "--workspace", "@iam/worker"], repoRoot, signal, 25_000, {
      ...managedDockerEnvironment(),
      npm_execpath: recorder,
      RECORDER_LOG: log,
    });
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain("Warning: containers diagnostics failed");
    const record = JSON.parse(await readFile(join(repoRoot, (await readFile(log, "utf8")).trim()), "utf8"));
    expect(record.status).toBe("cleaned");
  });
}, 45_000);

test("preserves execution and cleanup failures, then recovers only the recorded project", async () => {
  await withManagedCommandFixture("iam-cleanup-recovery-", async (directory, signal) => {
    const repoRoot = await createWorkspaceFixture(directory);
    const recorder = join(directory, "pnpm.mjs");
    const log = join(directory, "record.txt");
    await writeFile(
      recorder,
      `import { readFileSync, appendFileSync, unlinkSync } from "node:fs";
      const path = process.env.IAM_TEST_RESOURCE_RECORD; const record = JSON.parse(readFileSync(path, "utf8"));
      appendFileSync(process.env.RECORDER_LOG, JSON.stringify({record: path, args: process.argv.slice(2)}) + "\\n"); unlinkSync(record.composeEnvironmentFile); process.exit(37);`,
    );
    const result = await runOwnedCommand(
      ["node", entry, "--workspace", "@iam/worker", "--workspace", "@fixture/postgres"],
      repoRoot,
      signal,
      25_000,
      { ...managedDockerEnvironment(), npm_execpath: recorder, RECORDER_LOG: log },
    );
    expect(result.exitCode).toBe(37);
    expect(result.output).toContain("Integration bun failed with exit 37");
    expect(result.output).toContain("Resource cleanup failed; recover with");
    const executions = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(executions).toHaveLength(1);
    expect(executions[0].args).toContain("test:integration:bun");
    const path = executions[0].record;
    const record = JSON.parse(await readFile(join(repoRoot, path), "utf8"));
    expect(record.status).toBe("cleanup-failed");
    try {
      const inventory = await runOwnedCommand(
        ["docker", "ps", "-q", "--filter", `label=com.docker.compose.project=${record.project}`],
        repoRoot,
        signal,
        20_000,
        managedDockerEnvironment(),
      );
      expect(inventory.output).toContain("[stdout]");
    } finally {
      await writeFile(join(repoRoot, record.composeEnvironmentFile), "{}\n");
      const recovery = await runOwnedCommand(
        ["node", join(import.meta.dirname, "../../run-test-resource-cleanup.mjs"), "--record", path],
        repoRoot,
        signal,
        10_000,
        managedDockerEnvironment(),
      );
      expect(recovery.exitCode, recovery.output).toBe(0);
    }
    const recovered = JSON.parse(await readFile(join(repoRoot, path), "utf8"));
    expect(recovered.status).toBe("cleaned");
    await assertNoProjectResources(record.project, signal);
  });
}, 45_000);

test.each([false, true])(
  "the real package runner receives a declared PostgreSQL%s collection even for one selected file",
  async (withRedis) => {
    await withManagedCommandFixture("iam-service-declaration-", async (directory, signal) => {
      const root = await createWorkspaceFixture(directory);
      const owner = join(root, "apps/worker");
      const packageEntry = join(repoRoot, "scripts/run-package-integration.mjs");
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "@fixture/root", private: true, packageManager: "pnpm@12.5.1" }),
      );
      await writeFile(
        join(root, "pnpm-lock.yaml"),
        "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/worker: {}\n  apps/sso: {}\n  apps/database: {}\n",
      );
      await copyFile(join(repoRoot, "turbo.json"), join(root, "turbo.json"));
      const resources = {
        postgres: "IAM_WORKER_TEST_DATABASE_URL",
        ...(withRedis ? { redis: "IAM_WORKER_TEST_REDIS_URL" } : {}),
      };
      await writeFile(
        join(owner, "package.json"),
        JSON.stringify({
          name: "@iam/worker",
          iamTest: { integration: { bun: resources } },
          scripts: { "test:integration:bun": `node "${packageEntry}" bun -- bun test test-integration` },
        }),
      );
      const log = join(directory, "execution.json");
      await writeFile(
        join(owner, "test-integration/workflows/selected.integration.test.ts"),
        `
      import { test, expect } from "bun:test"; import { SQL, RedisClient } from "bun"; import { writeFileSync } from "node:fs";
      test("prepared services are usable", async () => {
        const sql = new SQL(process.env.IAM_WORKER_TEST_DATABASE_URL);
        try { const result = await sql.unsafe("select 7 as value"); expect(result[0].value).toBe(7); }
        finally { await sql.close(); }
        if (${withRedis}) {
          const redis = new RedisClient(process.env.IAM_WORKER_TEST_REDIS_URL);
          try { const pong = await redis.send("PING", []); expect(pong).toBe("PONG"); } finally { redis.close(); }
        }
        writeFileSync(${JSON.stringify(log)}, JSON.stringify({record: process.env.IAM_TEST_RESOURCE_RECORD, runId: process.env.IAM_TEST_RESOURCE_RUN_ID, postgres: process.env.IAM_WORKER_TEST_DATABASE_URL, redis: process.env.IAM_WORKER_TEST_REDIS_URL}));
      });`,
      );
      await writeFile(
        join(owner, "test-integration/workflows/unselected.integration.test.ts"),
        'throw new Error("Unselected file executed");',
      );
      const recorder = join(directory, "pnpm.mjs");
      await writeFile(
        recorder,
        `import {spawnSync} from "node:child_process";
        const result = spawnSync(process.execPath, [${JSON.stringify(join(repoRoot, "node_modules/turbo/bin/turbo"))}, ...process.argv.slice(4)], {stdio: "inherit"}); process.exit(result.status ?? 1);`,
      );
      const result = await runOwnedCommand(
        [
          "node",
          entry,
          "--workspace",
          "@iam/worker",
          "--file",
          "test-integration/workflows/selected.integration.test.ts",
        ],
        root,
        signal,
        25_000,
        {
          ...managedDockerEnvironment(),
          npm_execpath: recorder,
        },
      );
      expect(result.exitCode, result.output).toBe(0);
      const execution = JSON.parse(await readFile(log, "utf8"));
      const record = JSON.parse(await readFile(join(root, execution.record), "utf8"));
      expect(record).toMatchObject({
        runId: execution.runId,
        services: withRedis ? ["postgres", "redis"] : ["postgres"],
        status: "cleaned",
      });
      expect(execution.postgres).toMatch(/^postgres:\/\/iam_test:iam_test@127\.0\.0\.1:\d+\/iam_test$/);
      expect(Boolean(execution.redis)).toBe(withRedis);
      await assertNoProjectResources(record.project, signal);
    });
  },
  45_000,
);
