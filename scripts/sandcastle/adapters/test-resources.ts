import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  cleanupManagedResources,
  type ManagedComposeCommandOptions,
  managedCleanupCommand,
  readManagedResourceRegistry,
  readManagedResourceRun,
  repositoryPath,
} from "../../test-resources/managed-resources.mjs";
import type { LifecycleConfig } from "../core/config.ts";

const registryRoot = ".sandcastle/resources";
const artifacts = "test-results/integration";

export function createTestResourceLifecycle(
  runCommand?: ManagedComposeCommandOptions["runCommand"],
): Required<Pick<LifecycleConfig, "beforeExecutor" | "afterExecutor">> {
  return {
    async beforeExecutor({ cwd, worktreePath }) {
      await mkdir(join(cwd, registryRoot), { recursive: true });
      const directory = await mkdtemp(join(cwd, registryRoot, "executor-"));
      const registryDirectory = relative(cwd, directory);
      const registryFile = `${registryDirectory}/registry.jsonl`;
      try {
        await writeFile(join(cwd, registryFile), "", { flag: "wx", mode: 0o600 });
        await mkdir(join(cwd, artifacts), { recursive: true });
        // Create nested bind targets as the worktree owner before Docker starts.
        await mkdir(join(worktreePath, artifacts), { recursive: true });
        await mkdir(join(worktreePath, registryDirectory), { recursive: true });
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
      return {
        env: { IAM_TEST_RESOURCE_REGISTRY: registryFile },
        mounts: [registryDirectory, artifacts].map((path) => ({ hostPath: join(cwd, path), sandboxPath: path })),
      };
    },
    async afterExecutor({ cwd }, inputs) {
      const registryFile = inputs?.env?.IAM_TEST_RESOURCE_REGISTRY;
      if (!registryFile) return;
      let records: string[];
      try {
        const registry = await lstat(join(cwd, repositoryPath(cwd, registryFile)));
        if (!registry.isFile()) throw new Error("registry 必须为普通文件。");
        records = await readManagedResourceRegistry(cwd, registryFile);
      } catch (cause) {
        throw new Error(`无法读取执行器 registry：${registryFile}`, { cause });
      }
      const failures: unknown[] = [];
      for (const record of records.reverse()) {
        try {
          const run = await readManagedResourceRun(cwd, record);
          await cleanupManagedResources(run, { respectKeep: true, runCommand });
          if (run.record.keep) console.log(`保留测试环境 ${run.record.project}；清理：${managedCleanupCommand(run)}`);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, `执行器资源恢复失败；保留准确 registry：${registryFile}`);
      }
    },
  };
}
