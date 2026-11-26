import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type BindMountCreateOptions,
  type BindMountSandboxHandle,
  type BindMountSandboxProvider,
  createBindMountSandboxProvider,
  createIsolatedSandboxProvider,
} from "@ai-hero/sandcastle";
import { createManagedResourceRun, readManagedResourceRun } from "../../scripts/test-resources/managed-resources.mjs";
import { withTestResources } from "../test-resources.ts";

function createFakeBindMountProvider(
  onCreate: (options: BindMountCreateOptions) => Promise<void> | void,
): BindMountSandboxProvider {
  return createBindMountSandboxProvider({
    name: "fake-docker",
    env: { BASE_ENV: "1" },
    sandboxHomedir: "/home/agent",
    create: async (options) => {
      await onCreate(options);
      const handle: BindMountSandboxHandle = {
        worktreePath: "/home/agent/workspace",
        sandboxId: "fake-container",
        exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
        copyFileIn: async () => {},
        copyFileOut: async () => {},
        close: async () => {},
      };
      return handle;
    },
  });
}

async function invokeCreate(
  provider: BindMountSandboxProvider,
  options: BindMountCreateOptions,
): Promise<BindMountSandboxHandle> {
  if (!("create" in provider) || typeof provider.create !== "function") {
    throw new Error("Expected bind-mount provider with create()");
  }
  return await (provider.create as (opts: BindMountCreateOptions) => Promise<BindMountSandboxHandle>)(options);
}

test("pre-creates bind targets in options.worktreePath, injects registry, cleans registered projects, and deletes empty executor dir", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-resources-"));
  const worktreePath = join(cwd, ".sandcastle", "worktrees", "sandcastle-ticket-435");
  const siblingWorktreePath = join(cwd, ".sandcastle", "worktrees", "sandcastle-ticket-436");
  await mkdir(worktreePath, { recursive: true });
  await mkdir(siblingWorktreePath, { recursive: true });

  const composeCalls: (readonly string[])[] = [];
  const runCommand = async ({ executable, args = [] }: { executable: string; args?: readonly string[] }) => {
    expect(executable).toBe("docker");
    composeCalls.push(args);
    return { exitCode: 0, output: "", signal: null };
  };

  let firstCreateOpts: BindMountCreateOptions | undefined;
  let siblingCreateOpts: BindMountCreateOptions | undefined;
  let targetDirsExistedBeforeInnerCreate = false;

  const first = withTestResources({
    cwd,
    id: "ticket-435",
    runCommand,
    sandbox: createFakeBindMountProvider(async (options) => {
      firstCreateOpts = options;
      const registryFile = options.env.IAM_TEST_RESOURCE_REGISTRY;
      if (!registryFile) throw new Error("Missing IAM_TEST_RESOURCE_REGISTRY");
      const integrationStat = await stat(join(options.worktreePath, "test-results/integration"));
      const registryDirStat = await stat(join(options.worktreePath, dirname(registryFile)));
      targetDirsExistedBeforeInnerCreate = integrationStat.isDirectory() && registryDirStat.isDirectory();
    }),
  });

  const sibling = withTestResources({
    cwd,
    id: "ticket-436",
    runCommand,
    sandbox: createFakeBindMountProvider((options) => {
      siblingCreateOpts = options;
    }),
  });

  try {
    expect(first.sandbox.name).toBe("fake-docker");
    expect(first.sandbox.env).toEqual({ BASE_ENV: "1" });
    expect(first.sandbox.sandboxHomedir).toBe("/home/agent");

    await invokeCreate(first.sandbox, {
      worktreePath,
      hostRepoPath: cwd,
      mounts: [{ hostPath: worktreePath, sandboxPath: "/home/agent/workspace" }],
      env: { BASE_ENV: "1" },
    });
    await invokeCreate(sibling.sandbox, {
      worktreePath: siblingWorktreePath,
      hostRepoPath: cwd,
      mounts: [{ hostPath: siblingWorktreePath, sandboxPath: "/home/agent/workspace" }],
      env: { BASE_ENV: "1" },
    });

    expect(targetDirsExistedBeforeInnerCreate).toBe(true);
    const firstRegistry = firstCreateOpts?.env.IAM_TEST_RESOURCE_REGISTRY;
    const siblingRegistry = siblingCreateOpts?.env.IAM_TEST_RESOURCE_REGISTRY;
    if (!firstRegistry || !siblingRegistry) throw new Error("Expected both registries");
    expect(firstRegistry).not.toBe(siblingRegistry);
    expect(firstRegistry).toMatch(/^\.sandcastle\/resources\/executor-ticket-435-[^/]+\/registry\.jsonl$/);

    expect(firstCreateOpts?.mounts).toContainEqual({
      hostPath: join(cwd, dirname(firstRegistry)),
      sandboxPath: `/home/agent/workspace/${dirname(firstRegistry)}`,
    });
    expect(firstCreateOpts?.mounts).toContainEqual({
      hostPath: join(cwd, "test-results/integration"),
      sandboxPath: "/home/agent/workspace/test-results/integration",
    });

    const firstRun = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "first-project",
      registryFile: firstRegistry,
    });
    const siblingRun = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "sibling-project",
      registryFile: siblingRegistry,
    });

    await first.cleanup();

    const cleanedFirst = await readManagedResourceRun(cwd, firstRun.recordPath);
    const untouchedSibling = await readManagedResourceRun(cwd, siblingRun.recordPath);
    expect(composeCalls).toEqual([expect.arrayContaining(["--project-name", "first-project", "down"])]);
    expect(cleanedFirst.record.status).toBe("cleaned");
    expect(untouchedSibling.record.status).toBe("created");

    let removedDirError: unknown;
    try {
      await stat(join(cwd, dirname(firstRegistry)));
    } catch (error) {
      removedDirError = error;
    }
    expect(removedDirError).toMatchObject({ code: "ENOENT" });

    const siblingEntries = await readFile(join(cwd, siblingRegistry), "utf8");
    expect(siblingEntries.trim()).toBe(JSON.stringify(siblingRun.recordPath));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deletes empty executor directory when no managed resources were registered", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-empty-registry-"));
  const worktreePath = join(cwd, "wt");
  await mkdir(worktreePath, { recursive: true });

  let registryFile: string | undefined;
  const wrapped = withTestResources({
    cwd,
    id: "empty",
    sandbox: createFakeBindMountProvider((options) => {
      registryFile = options.env.IAM_TEST_RESOURCE_REGISTRY;
    }),
  });

  try {
    await invokeCreate(wrapped.sandbox, {
      worktreePath,
      hostRepoPath: cwd,
      mounts: [{ hostPath: worktreePath, sandboxPath: "/home/agent/workspace" }],
      env: {},
    });
    if (!registryFile) throw new Error("Expected registryFile");

    await wrapped.cleanup();

    let removedError: unknown;
    try {
      await stat(join(cwd, dirname(registryFile)));
    } catch (error) {
      removedError = error;
    }
    expect(removedError).toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("preserves executor registry directory when a registered run has keep=true", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-keep-registry-"));
  const worktreePath = join(cwd, "wt");
  await mkdir(worktreePath, { recursive: true });

  const composeCalls: (readonly string[])[] = [];
  const logs: string[] = [];
  let registryFile: string | undefined;

  const wrapped = withTestResources({
    cwd,
    id: "keep-run",
    log: (message) => logs.push(message),
    runCommand: async ({ args = [] }) => {
      composeCalls.push(args);
      return { exitCode: 0, output: "", signal: null };
    },
    sandbox: createFakeBindMountProvider((options) => {
      registryFile = options.env.IAM_TEST_RESOURCE_REGISTRY;
    }),
  });

  try {
    await invokeCreate(wrapped.sandbox, {
      worktreePath,
      hostRepoPath: cwd,
      mounts: [{ hostPath: worktreePath, sandboxPath: "/home/agent/workspace" }],
      env: {},
    });
    if (!registryFile) throw new Error("Expected registryFile");

    const normalRun = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "normal-project",
      registryFile,
    });
    const keptRun = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "kept-project",
      registryFile,
      keep: true,
    });

    await wrapped.cleanup();

    const cleanedNormal = await readManagedResourceRun(cwd, normalRun.recordPath);
    const preservedKept = await readManagedResourceRun(cwd, keptRun.recordPath);
    const retainedRegistry = await readFile(join(cwd, registryFile), "utf8");

    expect(composeCalls).toEqual([expect.arrayContaining(["--project-name", "normal-project", "down"])]);
    expect(cleanedNormal.record.status).toBe("cleaned");
    expect(preservedKept.record.keep).toBe(true);
    expect(retainedRegistry).toContain(keptRun.recordPath);
    expect(logs.some((line) => line.includes("kept-project"))).toBe(true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("preserves executor registry on cleanup failure and deletes executor directory once retry succeeds", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-cleanup-failure-"));
  const worktreePath = join(cwd, "wt");
  await mkdir(worktreePath, { recursive: true });

  let dockerReady = false;
  let registryFile: string | undefined;

  const wrapped = withTestResources({
    cwd,
    id: "retry-run",
    runCommand: async ({ args = [] }) =>
      args.includes("retry-project") && !dockerReady
        ? { exitCode: 1, output: "Docker unavailable", signal: null }
        : { exitCode: 0, output: "", signal: null },
    sandbox: createFakeBindMountProvider((options) => {
      registryFile = options.env.IAM_TEST_RESOURCE_REGISTRY;
    }),
  });

  try {
    await invokeCreate(wrapped.sandbox, {
      worktreePath,
      hostRepoPath: cwd,
      mounts: [{ hostPath: worktreePath, sandboxPath: "/home/agent/workspace" }],
      env: {},
    });
    if (!registryFile) throw new Error("Expected registryFile");

    const failingRun = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "retry-project",
      registryFile,
    });
    const healthyRun = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "other-project",
      registryFile,
    });

    let failure: unknown;
    try {
      await wrapped.cleanup();
    } catch (error) {
      failure = error;
    }

    const attempted = await readManagedResourceRun(cwd, failingRun.recordPath);
    const cleaned = await readManagedResourceRun(cwd, healthyRun.recordPath);
    const retained = await readFile(join(cwd, registryFile), "utf8");

    expect(failure).toBeInstanceOf(AggregateError);
    expect(String(failure)).toContain(registryFile);
    expect(retained).toContain(failingRun.recordPath);
    expect(attempted.record.status).toBe("cleanup-failed");
    expect(cleaned.record.status).toBe("cleaned");

    dockerReady = true;
    await wrapped.cleanup();

    const recovered = await readManagedResourceRun(cwd, failingRun.recordPath);
    expect(recovered.record.status).toBe("cleaned");

    let removedError: unknown;
    try {
      await stat(join(cwd, dirname(registryFile)));
    } catch (error) {
      removedError = error;
    }
    expect(removedError).toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("refuses cleanup when registry is replaced by a symlink and rejects non-bind-mount providers", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-registry-symlink-"));
  const worktreePath = join(cwd, "wt");
  await mkdir(worktreePath, { recursive: true });

  const isolated = createIsolatedSandboxProvider({
    name: "fake-isolated",
    create: async () => ({
      worktreePath: "/app",
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      copyIn: async () => {},
      copyFileOut: async () => {},
      close: async () => {},
    }),
  });
  expect(() => withTestResources({ cwd, id: "bad", sandbox: isolated })).toThrow(/bind-mount/i);

  const projects: string[] = [];
  const runCommand = async ({ args = [] }: { args?: readonly string[] }) => {
    projects.push(args[args.indexOf("--project-name") + 1] ?? "");
    return { exitCode: 0, output: "", signal: null };
  };

  let registry: string | undefined;
  let siblingRegistry: string | undefined;
  const first = withTestResources({
    cwd,
    id: "first",
    runCommand,
    sandbox: createFakeBindMountProvider((options) => {
      registry = options.env.IAM_TEST_RESOURCE_REGISTRY;
    }),
  });
  const sibling = withTestResources({
    cwd,
    id: "sibling",
    runCommand,
    sandbox: createFakeBindMountProvider((options) => {
      siblingRegistry = options.env.IAM_TEST_RESOURCE_REGISTRY;
    }),
  });

  try {
    await invokeCreate(first.sandbox, {
      worktreePath,
      hostRepoPath: cwd,
      mounts: [{ hostPath: worktreePath, sandboxPath: "/home/agent/workspace" }],
      env: {},
    });
    await invokeCreate(sibling.sandbox, {
      worktreePath,
      hostRepoPath: cwd,
      mounts: [{ hostPath: worktreePath, sandboxPath: "/home/agent/workspace" }],
      env: {},
    });
    if (!registry || !siblingRegistry) throw new Error("Expected both registries");

    await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "sibling-project",
      registryFile: siblingRegistry,
    });
    await unlink(join(cwd, registry));
    await symlink(join(cwd, siblingRegistry), join(cwd, registry));

    let failure: unknown;
    try {
      await first.cleanup();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain(registry);
    expect(projects).toEqual([]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
