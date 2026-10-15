import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BindMountSandboxHandle, Sandbox } from "@ai-hero/sandcastle";
import { codex } from "@ai-hero/sandcastle";
import {
  cleanupManagedResources,
  formatResourceFailure,
  type ManagedResourceRun,
  readManagedResourceRegistry,
  readManagedResourceRun,
  saveManagedResourceRun,
} from "../test-resources/managed-resources.mjs";
import { shellQuote } from "./codex-provider.mts";
import { command } from "./commands.ts";
import { type ExecutorResources, recoverExecutorResources, withExecutorResources } from "./resources.ts";
import { checkedExec } from "./runtime.mts";
import { dockerPreflight, dockerSandbox, withDockerPreflight } from "./sandbox.mts";

const complete = "<promise>COMPLETE</promise>";
const completionCommand = `printf '%s\\n' ${shellQuote(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: complete } }))}`;

/** Real root -> Turbo -> Bun commands, with a controlled resource consumer. */
export async function smokeCommandResources(
  sandbox: Sandbox,
  cwd: string,
  resources: ExecutorResources,
  signal: AbortSignal,
): Promise<void> {
  const file = "apps/worker/test-integration/redis/sandcastle-resource-smoke.integration.test.ts";
  const fixture = `
import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import Redis from "ioredis";
test("each AFK command receives a fresh managed Redis database", async () => {
  const redis = new Redis(process.env.IAM_WORKER_TEST_REDIS_URL!);
  try {
    const previous = await redis.get("iam-afk-command-smoke");
    expect(previous).toBeNull();
    const value = randomUUID();
    await redis.set("iam-afk-command-smoke", value);
    const observed = await redis.get("iam-afk-command-smoke");
    expect(observed).toBe(value);
    const recordPath = process.env.IAM_TEST_RESOURCE_RECORD!;
    const record = JSON.parse(readFileSync(join("../..", recordPath), "utf8"));
    expect(record.runId).toBe(process.env.IAM_TEST_RESOURCE_RUN_ID);
    writeFileSync(join("../..", dirname(recordPath), "smoke-data.json"), JSON.stringify({value, url: process.env.IAM_WORKER_TEST_REDIS_URL, previous}));
  } finally { await redis.quit(); }
});
`;
  await checkedExec(sandbox, `printf '%s' ${shellQuote(fixture)} > ${shellQuote(file)}`, signal);
  const before = await readManagedResourceRegistry(cwd, resources.registryFile);
  try {
    const denied = withDockerPreflight({
      ...codex("smoke-no-model", { captureSessions: false }),
      buildPrintCommand: () => ({ command: "touch /tmp/iam-afk-network-agent-started" }),
    });
    let preflightFailure: unknown;
    try {
      await sandbox.run({
        agent: {
          ...denied,
          buildPrintCommand: (options) => {
            const built = denied.buildPrintCommand(options);
            return {
              ...built,
              command: `IAM_AFK_HOST_PROBE_URL=http://127.0.0.1:1 sh -c ${shellQuote(built.command)}`,
            };
          },
        },
        prompt: "Unavailable host network must prevent the model command.",
        signal,
      });
    } catch (error) {
      preflightFailure = error;
    }
    await checkedExec(sandbox, "test ! -e /tmp/iam-afk-network-agent-started", signal);
    if (!String(preflightFailure).includes("Host networking 预检失败"))
      throw new Error("Docker/host-network 条件失败没有阻止模型命令。", { cause: preflightFailure });
    for (const index of [0, 1]) {
      const result = await sandbox.run({
        agent: withDockerPreflight({
          ...codex("smoke-no-model", { captureSessions: false }),
          buildPrintCommand: () => ({
            command: `pnpm test:integration --workspace @iam/worker --profile redis --file ${shellQuote(file)} && ${completionCommand}`,
          }),
        }),
        prompt: `Run fresh resource command ${index}; no model call.`,
        signal,
      });
      if (result.completionSignal !== complete) throw new Error(`Integration smoke ${index} 未完成。`);
      const records = (await readManagedResourceRegistry(cwd, resources.registryFile)).filter(
        (path) => !before.includes(path),
      );
      if (records.length !== index + 1) throw new Error("正式命令没有独立登记宿主可读的运行记录。");
      const run = await readManagedResourceRun(cwd, records[index]!);
      if (run.record.status !== "cleaned") throw new Error("Integration 正常退出前未清理自己的 project。");
      await assertProjectState(cwd, run.record.project, false);
    }
    const records = (await readManagedResourceRegistry(cwd, resources.registryFile)).filter(
      (path) => !before.includes(path),
    );
    const [first, second] = await Promise.all(records.map((path) => readManagedResourceRun(cwd, path)));
    const observations = await Promise.all(
      [first!, second!].map(async (run) =>
        JSON.parse(await readFile(join(cwd, run.record.artifactDirectory, "smoke-data.json"), "utf8")),
      ),
    );
    if (
      first!.record.project === second!.record.project ||
      first!.record.runId === second!.record.runId ||
      observations[0].url === observations[1].url ||
      observations[0].value === observations[1].value ||
      observations.some((observation) => observation.previous !== null)
    )
      throw new Error("连续正式 Integration 命令共享了 project、URL 或数据。");
    console.log("两条真实 Integration 命令的 project、URL、数据与宿主记录独立，命令结束即清理。");
  } finally {
    await checkedExec(sandbox, `rm -f ${shellQuote(file)}`);
  }
}

async function assertProjectState(cwd: string, project: string, running: boolean) {
  const containers = await command(
    "docker",
    ["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`],
    cwd,
  );
  if (Boolean(containers) !== running) throw new Error(`Project ${project} 的存活状态不符合预期。`);
  if (!running)
    for (const kind of ["network", "volume"])
      if (await command("docker", [kind, "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`], cwd))
        throw new Error(`Project ${project} 仍有 ${kind}。`);
}

/** Another live executor must survive exact recovery; explicit keep survives its own finalizer. */
export async function smokeExecutorRecovery(options: {
  cwd: string;
  image: string;
  signal: AbortSignal;
}): Promise<void> {
  const { cwd, image, signal } = options;
  let retained: ManagedResourceRun | undefined;
  let orphan: ManagedResourceRun | undefined;
  let orphanDescriptor = "";
  let release!: () => void;
  const finished = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ready!: () => void;
  let failed!: (error: unknown) => void;
  const available = new Promise<void>((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const start = async (resources: ExecutorResources, keep: boolean) => {
    const provider = dockerSandbox({
      ...resources,
      imageName: image,
      mounts: [
        ...resources.mounts,
        {
          hostPath: join(cwd, ".sandcastle/dependencies/node_modules"),
          sandboxPath: "/home/agent/workspace/node_modules",
          readonly: true,
        },
      ],
    });
    const handle = await provider.create({
      hostRepoPath: cwd,
      worktreePath: cwd,
      mounts: [{ hostPath: cwd, sandboxPath: "/home/agent/workspace" }],
      env: provider.env,
    });
    const preflight = await handle.exec(dockerPreflight);
    if (preflight.exitCode !== 0) throw new Error(preflight.stderr || "Executor Docker preflight failed");
    const program = `import {createManagedResourceRun,startManagedResources} from './scripts/test-resources/managed-resources.mjs';
      const run=await createManagedResourceRun({root:process.cwd(),composeFile:'scripts/test-resources/compose.yaml',services:['redis'],keep:${keep},registryFile:process.env.IAM_TEST_RESOURCE_REGISTRY});
      await startManagedResources(run);`;
    const result = await handle.exec(`node --input-type=module -e ${shellQuote(program)}`);
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
    const records = await readManagedResourceRegistry(cwd, resources.registryFile);
    if (records.length !== 1) throw new Error("异常执行器未交付准确资源记录。");
    return { handle, run: await readManagedResourceRun(cwd, records[0]!) };
  };
  let keptHandle: BindMountSandboxHandle | undefined;
  const kept = withExecutorResources(
    {
      ...options,
      close: async () => {
        await keptHandle?.close();
      },
    },
    async (resources) => {
      const created = await start(resources, true);
      keptHandle = created.handle;
      retained = created.run;
      ready();
      await finished;
    },
  ).catch((error) => {
    failed(error);
    throw error;
  });
  // Observe its failure even when provisioning fails before the synchronization point.
  void kept.catch(() => {});
  try {
    await available;
    let orphanHandle: BindMountSandboxHandle | undefined;
    let failure: unknown;
    try {
      await withExecutorResources(
        {
          ...options,
          close: async () => {
            await orphanHandle?.close();
          },
        },
        async (resources) => {
          const created = await start(resources, false);
          orphanHandle = created.handle;
          orphan = created.run;
          orphanDescriptor = resources.registryFile.replace("registry.jsonl", "executor.json");
          if (orphan.record.project === retained!.record.project) throw new Error("并行执行器复用了 project。");
          // A run-scoped invalid Compose path forces outer cleanup to fail, without
          // changing Docker itself or another executor's inputs.
          orphan.record.composeFile = `${orphan.record.artifactDirectory}/missing-compose.yaml`;
          await saveManagedResourceRun(orphan);
          // The executor fails after creating resources without running their command finalizer.
          throw new Error("controlled executor failure after resource initialization");
        },
      );
    } catch (error) {
      failure = error;
    }
    const failureDetails = formatResourceFailure(failure);
    if (!failureDetails.includes("controlled executor failure") || !failureDetails.includes("Resource cleanup failed"))
      throw new Error("执行器原始错误或 cleanup 错误未保留。", { cause: failure });
    const incomplete = await readManagedResourceRun(cwd, orphan!.recordPath);
    const executorRecord = JSON.parse(await readFile(join(cwd, orphanDescriptor), "utf8"));
    if (
      incomplete.record.status !== "cleanup-failed" ||
      executorRecord.status !== "failed" ||
      !executorRecord.failures.some((message: string) => message.includes("controlled executor failure")) ||
      !(await readFile(join(cwd, executorRecord.registryFile), "utf8")).includes(orphan!.recordPath)
    )
      throw new Error("失败 executor/registry 未保留恢复事实。");
    await assertProjectState(cwd, orphan!.record.project, true);
    await assertProjectState(cwd, retained!.record.project, true);
    // Restore this smoke's known input, then use the public executor recovery entry.
    incomplete.record.composeFile = "scripts/test-resources/compose.yaml";
    await saveManagedResourceRun(incomplete);
    await recoverExecutorResources(cwd, orphanDescriptor);
    const recovered = await readManagedResourceRun(cwd, orphan!.recordPath);
    if (recovered.record.status !== "cleaned") throw new Error("Outer 没有恢复未完成的准确记录。");
    await assertProjectState(cwd, orphan!.record.project, false);
    await assertProjectState(cwd, retained!.record.project, true);
    release();
    await kept;
    await assertProjectState(cwd, retained!.record.project, true);
    await writeFile(
      join(cwd, retained!.record.artifactDirectory, "afk-recovery.json"),
      JSON.stringify(
        {
          recoveredRecord: orphan!.recordPath,
          keptRecord: retained!.recordPath,
          originalFailure: failureDetails,
          cleanupFailurePreserved: true,
          failedRegistryRetained: true,
          parallelExecutorSurvived: true,
          keepRespected: true,
        },
        null,
        2,
      ),
    );
    console.log("异常执行器 exact-record 恢复、并行隔离和显式 keep 通过。");
  } finally {
    release();
    await kept.catch(() => {});
    // The smoke explicitly owns the retained environment and overrides keep for final recovery.
    for (const run of [orphan, retained])
      if (run) {
        const current = await readManagedResourceRun(cwd, run.recordPath);
        current.record.composeFile = "scripts/test-resources/compose.yaml";
        await saveManagedResourceRun(current);
        await cleanupManagedResources(current);
      }
  }
  signal.throwIfAborted();
}
