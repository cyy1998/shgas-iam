import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import type { DockerOptions } from "@ai-hero/sandcastle/sandboxes/docker";
import {
  cleanupManagedResources,
  formatResourceFailure,
  managedCleanupCommand,
  readManagedResourceRegistry,
  readManagedResourceRun,
  repositoryPath,
} from "../test-resources/managed-resources.mjs";
import { command } from "./commands.ts";
import type { DockerConfig } from "./docker-config.ts";
import { closeDockerConfig, prepareDockerConfig } from "./docker-config.ts";
import type { DockerDaemonAccess } from "./sandbox.mts";

export const hostNetworkRequirements =
  "需要 Linux Docker Engine，或 Docker Desktop 4.34+ 已启用 host networking 且关闭 Enhanced Container Isolation；" +
  "需要实际 UID 1000 访问共享 Docker socket，不自动切换网络、DinD 或代理。";

export class ExecutorTerminationError extends Error {}

export function hasUnstoppedExecutor(error: unknown): boolean {
  return (
    error instanceof ExecutorTerminationError ||
    (error instanceof AggregateError && error.errors.some(hasUnstoppedExecutor)) ||
    (error instanceof Error && error.cause !== undefined && hasUnstoppedExecutor(error.cause))
  );
}

export type ExecutorResources = {
  containerName: string;
  network: "host";
  containerUid: 1000;
  containerGid: 1000;
  daemonAccess: DockerDaemonAccess;
  env: Record<string, string>;
  mounts: NonNullable<DockerOptions["mounts"]>;
  registryFile: string;
};

/** Missing is a valid stopped state; daemon errors are never evidence of termination. */
async function inspectSandbox(cwd: string, name: string): Promise<{ Running: boolean } | undefined> {
  try {
    return JSON.parse(await command("docker", ["inspect", "--format", "{{json .State}}", name], cwd, 10_000));
  } catch (error) {
    if (/No such (?:object|container)/i.test(formatResourceFailure(error))) return undefined;
    throw error;
  }
}

export async function stopExecutorSandbox(cwd: string, name: string): Promise<void> {
  const state = await inspectSandbox(cwd, name);
  if (!state) return;
  if (state.Running) await command("docker", ["stop", "--time", "2", name], cwd, 20_000);
  await command("docker", ["wait", name], cwd, 10_000);
  if ((await inspectSandbox(cwd, name))?.Running) throw new Error(`Sandbox ${name} 仍在运行；保留 registry 等待恢复。`);
}

/** One executor owns only these registered records; command lifecycles own all data services. */
export async function cleanupExecutorResources(cwd: string, registryFile: string): Promise<void> {
  const failures: unknown[] = [];
  for (const recordPath of await readManagedResourceRegistry(cwd, registryFile)) {
    try {
      const run = await readManagedResourceRun(cwd, recordPath);
      await cleanupManagedResources(run, { respectKeep: true, timeoutMs: 30_000 });
      if (run.record.keep) console.log(`保留测试环境 ${run.record.project}；清理：${managedCleanupCommand(run)}`);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, `执行器资源恢复失败；保留准确 registry：${registryFile}`);
}

/** Explicit recovery uses the same stop/wait and exact registry cleanup as the live finalizer. */
export async function recoverExecutorResources(cwd: string, descriptorFile: string): Promise<void> {
  const path = repositoryPath(cwd, descriptorFile);
  const record = JSON.parse(await readFile(join(cwd, path), "utf8"));
  if (
    typeof record.runId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(record.runId) ||
    path !== `.sandcastle/resources/executor-${record.runId}/executor.json` ||
    record.containerName !== `iam-afk-executor-${record.runId}` ||
    record.socketProbeName !== `iam-afk-socket-${record.runId}` ||
    record.registryFile !== `.sandcastle/resources/executor-${record.runId}/registry.jsonl`
  )
    throw new Error("Invalid executor recovery record");
  await stopExecutorSandbox(cwd, record.containerName);
  await cleanupExecutorResources(cwd, record.registryFile);
  for (const name of [record.containerName, record.socketProbeName])
    if (await inspectSandbox(cwd, name)) await command("docker", ["rm", "--force", name], cwd, 10_000);
  await closeDockerConfig(record.runId);
  console.log(`执行器准确恢复清理完成：${path}`);
}

export async function withExecutorResources<T>(
  options: { cwd: string; image: string; signal: AbortSignal; close?: () => Promise<void>; onUnsafeClose?: () => void },
  use: (resources: ExecutorResources) => Promise<T>,
): Promise<T> {
  const { cwd, image, signal } = options;
  const runId = randomUUID();
  const directory = `.sandcastle/resources/executor-${runId}`;
  const registryFile = `${directory}/registry.jsonl`;
  const containerName = `iam-afk-executor-${runId}`;
  const socketProbeName = `iam-afk-socket-${runId}`;
  const descriptor = join(cwd, directory, "executor.json");
  const failures: unknown[] = [];
  let result: T | undefined;
  let stopped = false;
  let abortStop: Promise<void> | undefined;
  let dockerConfig: DockerConfig | undefined;
  const server = createServer((_request, response) => response.end(runId));
  const save = (status: string) =>
    writeFile(
      descriptor,
      `${JSON.stringify({ runId, containerName, socketProbeName, registryFile, status, failures: failures.map(formatResourceFailure) }, null, 2)}\n`,
      { mode: 0o600 },
    );
  const abort = () => {
    abortStop ??= stopExecutorSandbox(cwd, containerName).catch((error) => {
      failures.push(error);
    });
  };
  await mkdir(join(cwd, directory), { recursive: true });
  await mkdir(join(cwd, "test-results/integration"), { recursive: true });
  await writeFile(join(cwd, registryFile), "", { flag: "wx", mode: 0o600 });
  // Persist names before provisioning. SDK close cannot prove the creator stopped.
  await save("registered");
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    dockerConfig = await prepareDockerConfig(runId, cwd);
    if ((await command("docker", ["info", "--format", "{{.OSType}}"], cwd)) !== "linux")
      throw new Error(hostNetworkRequirements);
    const socketGroupId = Number(
      await command(
        "docker",
        [
          "run",
          "--rm",
          "--name",
          socketProbeName,
          "--mount",
          "type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly",
          "--entrypoint",
          "stat",
          image,
          "-c",
          "%g",
          "/var/run/docker.sock",
        ],
        cwd,
      ),
    );
    if (!Number.isSafeInteger(socketGroupId) || socketGroupId < 0) throw new Error("无法读取 Docker socket GID。");
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Host-network 预检缺少 loopback 端口。");
    await save("executing");
    result = await use({
      containerName,
      network: "host",
      containerUid: 1000,
      containerGid: 1000,
      daemonAccess: { socketGroupId },
      registryFile,
      env: {
        IAM_TEST_RESOURCE_REGISTRY: registryFile,
        IAM_AFK_HOST_PROBE_URL: `http://127.0.0.1:${address.port}`,
        IAM_AFK_HOST_PROBE_VALUE: runId,
      },
      mounts: [
        ...["test-results/integration", directory].map((path) => ({
          hostPath: join(cwd, path),
          sandboxPath: `/home/agent/workspace/${path}`,
        })),
        ...dockerConfig.mounts,
      ],
    });
  } catch (error) {
    failures.push(error);
  } finally {
    signal.removeEventListener("abort", abort);
    await abortStop;
    try {
      await stopExecutorSandbox(cwd, containerName);
      stopped = true;
      await save("creator-stopped");
      // Recovery uses a fresh bounded budget, independent of the execution signal.
      await cleanupExecutorResources(cwd, registryFile);
    } catch (error) {
      failures.push(error);
    }
    if (stopped) {
      try {
        if (await inspectSandbox(cwd, containerName))
          await command("docker", ["rm", "--force", containerName], cwd, 10_000);
      } catch (error) {
        failures.push(error);
      }
      try {
        await options.close?.();
      } catch (error) {
        failures.push(error);
      }
      try {
        await dockerConfig?.close();
      } catch (error) {
        failures.push(error);
      }
    } else {
      failures.push(new ExecutorTerminationError(`创建者 sandbox 尚未确认停止；先按 ${descriptor} 恢复。`));
      if (dockerConfig?.recoveryDirectory)
        failures.push(new ExecutorTerminationError(`保留 Docker 配置暂存目录：${dockerConfig.recoveryDirectory}`));
      options.onUnsafeClose?.();
    }
    try {
      if (await inspectSandbox(cwd, socketProbeName))
        await command("docker", ["rm", "--force", socketProbeName], cwd, 10_000);
    } catch (error) {
      failures.push(error);
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error && (!("code" in error) || error.code !== "ERR_SERVER_NOT_RUNNING")) reject(error);
        else resolve();
      }),
    ).catch((error) => {
      failures.push(error);
    });
    try {
      await save(failures.length ? "failed" : "closed");
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length)
    throw new AggregateError(
      failures,
      `执行器失败或收尾未完成；恢复记录：${descriptor}\n${failures.map(formatResourceFailure).join("\n")}`,
    );
  return result!;
}
