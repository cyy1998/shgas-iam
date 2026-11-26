import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";
import { promisify } from "node:util";
import {
  type BindMountSandboxProvider,
  type BindMountSandboxProviderConfig,
  createBindMountSandboxProvider,
  type SandboxProvider,
} from "@ai-hero/sandcastle";
import {
  cleanupManagedResources,
  type ManagedComposeCommandOptions,
  managedCleanupCommand,
  readManagedResourceRegistry,
  readManagedResourceRun,
  repositoryPath,
} from "../scripts/test-resources/managed-resources.mjs";

const exec = promisify(execFile);
const registryRoot = ".sandcastle/resources";
const artifacts = "test-results/integration";
const defaultSandboxWorktreePath = "/home/agent/workspace";

type BindMountCreate = BindMountSandboxProviderConfig["create"];
type RuntimeBindMountProvider = BindMountSandboxProvider & {
  readonly tag: "bind-mount";
  readonly create: BindMountCreate;
};

type TrackedRegistry = {
  directory: string;
  registryFile: string;
  sandboxId?: string;
};

export type TestResourceSandboxOptions = {
  cwd: string;
  id: string;
  sandbox: SandboxProvider;
  runCommand?: ManagedComposeCommandOptions["runCommand"];
  verifySandboxStopped?: (sandboxId: string) => Promise<void>;
  log?: (message: string) => void;
};

async function defaultVerifySandboxStopped(cwd: string, sandboxId: string): Promise<void> {
  const { stdout } = await exec("docker", ["ps", "-aq", "--no-trunc", "--filter", `id=${sandboxId}`], { cwd });
  if (stdout.trim().length > 0) {
    throw new Error(`Sandbox container ${sandboxId} is still present; refusing to clean active test resources.`);
  }
}

export type TestResourceSandbox = {
  sandbox: BindMountSandboxProvider;
  cleanup: () => Promise<void>;
};

function assertBindMountProvider(provider: SandboxProvider): RuntimeBindMountProvider {
  if (
    "tag" in provider &&
    provider.tag === "bind-mount" &&
    "create" in provider &&
    typeof provider.create === "function"
  ) {
    return provider as RuntimeBindMountProvider;
  }
  throw new Error("Test resources wrapper requires a bind-mount sandbox provider.");
}

function sanitizeExecutorId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-") || "run";
}

export function withTestResources(options: TestResourceSandboxOptions): TestResourceSandbox {
  const inner = assertBindMountProvider(options.sandbox);
  const innerCreate = inner.create.bind(inner);
  const {
    cwd,
    runCommand,
    verifySandboxStopped = (sandboxId) => defaultVerifySandboxStopped(cwd, sandboxId),
    log = console.log,
  } = options;
  const safeId = sanitizeExecutorId(options.id);
  let tracked: TrackedRegistry[] = [];

  const sandbox = createBindMountSandboxProvider({
    name: inner.name,
    env: inner.env,
    sandboxHomedir: inner.sandboxHomedir,
    create: async (createOptions) => {
      await mkdir(join(cwd, registryRoot), { recursive: true });
      const directory = await mkdtemp(join(cwd, registryRoot, `executor-${safeId}-`));
      const registryDirectory = relative(cwd, directory).replaceAll("\\", "/");
      const registryFile = `${registryDirectory}/registry.jsonl`;
      try {
        await writeFile(join(cwd, registryFile), "", { flag: "wx", mode: 0o600 });
        await mkdir(join(cwd, artifacts), { recursive: true });
        // Pre-create nested bind targets inside options.worktreePath as the worktree owner before Docker starts.
        await mkdir(join(createOptions.worktreePath, artifacts), { recursive: true });
        await mkdir(join(createOptions.worktreePath, registryDirectory), { recursive: true });

        const sandboxWorktreePath =
          createOptions.mounts.find((mount) => mount.hostPath === createOptions.worktreePath)?.sandboxPath ??
          defaultSandboxWorktreePath;

        const handle = await innerCreate({
          ...createOptions,
          env: {
            ...createOptions.env,
            IAM_TEST_RESOURCE_REGISTRY: registryFile,
          },
          mounts: [
            ...createOptions.mounts,
            {
              hostPath: join(cwd, registryDirectory),
              sandboxPath: posix.join(sandboxWorktreePath, registryDirectory),
            },
            {
              hostPath: join(cwd, artifacts),
              sandboxPath: posix.join(sandboxWorktreePath, artifacts),
            },
          ],
        });
        tracked.push({ directory, registryFile, sandboxId: handle.sandboxId });
        return handle;
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
    },
  });

  const cleanup = async (): Promise<void> => {
    const remaining: TrackedRegistry[] = [];
    const errors: unknown[] = [];

    for (const entry of [...tracked].reverse()) {
      const { directory, registryFile, sandboxId } = entry;
      if (sandboxId) {
        try {
          await verifySandboxStopped(sandboxId);
        } catch (cause) {
          remaining.push(entry);
          errors.push(new Error(`无法确认沙箱已停止（${sandboxId}）；保留准确 registry：${registryFile}`, { cause }));
          continue;
        }
      }
      let records: string[];
      try {
        const registry = await lstat(join(cwd, repositoryPath(cwd, registryFile)));
        if (!registry.isFile()) throw new Error("registry 必须为普通文件。");
        records = await readManagedResourceRegistry(cwd, registryFile);
      } catch (cause) {
        remaining.push(entry);
        errors.push(new Error(`无法读取执行器 registry：${registryFile}`, { cause }));
        continue;
      }

      const failures: unknown[] = [];
      let hasKept = false;
      for (const record of [...records].reverse()) {
        try {
          const run = await readManagedResourceRun(cwd, record);
          await cleanupManagedResources(run, { respectKeep: true, runCommand });
          if (run.record.keep) {
            hasKept = true;
            log(`保留测试环境 ${run.record.project}；清理：${managedCleanupCommand(run)}`);
          }
        } catch (error) {
          failures.push(error);
        }
      }

      if (failures.length > 0) {
        remaining.push(entry);
        errors.push(new AggregateError(failures, `执行器资源恢复失败；保留准确 registry：${registryFile}`));
      } else if (!hasKept) {
        await rm(directory, { recursive: true, force: true });
      }
    }

    tracked = remaining.reverse();
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "执行器资源恢复失败");
  };

  return { sandbox, cleanup };
}
