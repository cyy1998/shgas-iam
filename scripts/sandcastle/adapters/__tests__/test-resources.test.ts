import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { codex } from "@ai-hero/sandcastle";
import { createManagedResourceRun, readManagedResourceRun } from "../../../test-resources/managed-resources.mjs";
import type { ExecutorContext } from "../../core/config.ts";
import { createTestResourceLifecycle } from "../test-resources.ts";

test("closing one executor cleans only its registered Compose projects and respects keep", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-resources-"));
  const composeCalls: (readonly string[])[] = [];
  const lifecycle = createTestResourceLifecycle(async ({ executable, args = [] }) => {
    expect(executable).toBe("docker");
    composeCalls.push(args);
    return { exitCode: 0, output: "", signal: null };
  });
  const executor = (id: string): ExecutorContext => ({
    id,
    cwd,
    worktreePath: join(cwd, id),
    phase: "implement",
    role: { provider: codex("fixture") },
  });
  try {
    const first = executor("first");
    const sibling = executor("sibling");
    const [firstInputs, siblingInputs] = await Promise.all([
      lifecycle.beforeExecutor(first),
      lifecycle.beforeExecutor(sibling),
    ]);
    const firstRegistry = firstInputs?.env?.IAM_TEST_RESOURCE_REGISTRY;
    const siblingRegistry = siblingInputs?.env?.IAM_TEST_RESOURCE_REGISTRY;
    if (!firstRegistry || !siblingRegistry) throw new Error("Expected both registries");
    expect(firstRegistry).not.toBe(siblingRegistry);
    expect(firstInputs?.mounts).toContainEqual({
      hostPath: join(cwd, dirname(firstRegistry)),
      sandboxPath: dirname(firstRegistry),
    });
    expect(siblingInputs?.mounts).not.toContainEqual({
      hostPath: join(cwd, dirname(firstRegistry)),
      sandboxPath: dirname(firstRegistry),
    });

    const record = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "first-project",
      registryFile: firstRegistry,
    });
    const kept = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "kept-project",
      registryFile: firstRegistry,
      keep: true,
    });
    const inFlight = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "sibling-project",
      registryFile: siblingRegistry,
    });
    await lifecycle.afterExecutor(first, firstInputs);

    const cleaned = await readManagedResourceRun(cwd, record.recordPath);
    const preserved = await readManagedResourceRun(cwd, kept.recordPath);
    const siblingRun = await readManagedResourceRun(cwd, inFlight.recordPath);
    const siblingEntries = await readFile(join(cwd, siblingRegistry), "utf8");
    expect(composeCalls).toEqual([expect.arrayContaining(["--project-name", "first-project", "down"])]);
    expect(cleaned.record.status).toBe("cleaned");
    expect(preserved.record.keep).toBe(true);
    expect(siblingRun.record.status).toBe("created");
    expect(siblingEntries.trim()).toBe(JSON.stringify(inFlight.recordPath));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a Compose cleanup failure retains the executor registry and allows exact recovery", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-cleanup-"));
  let dockerReady = false;
  const lifecycle = createTestResourceLifecycle(async ({ args = [] }) =>
    args.includes("retry-project") && !dockerReady
      ? { exitCode: 1, output: "Docker unavailable", signal: null }
      : { exitCode: 0, output: "", signal: null },
  );
  const context: ExecutorContext = {
    id: "ticket",
    cwd,
    worktreePath: cwd,
    phase: "implement",
    role: { provider: codex("fixture") },
  };
  try {
    const inputs = await lifecycle.beforeExecutor(context);
    const registryFile = inputs?.env?.IAM_TEST_RESOURCE_REGISTRY;
    if (!registryFile) throw new Error("Expected a registry");
    const record = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "retry-project",
      registryFile,
    });
    const other = await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "other-project",
      registryFile,
    });
    const failure = await lifecycle.afterExecutor(context, inputs).catch((error: unknown) => error);
    const attempted = await readManagedResourceRun(cwd, record.recordPath);
    const cleaned = await readManagedResourceRun(cwd, other.recordPath);
    const retained = await readFile(join(cwd, registryFile), "utf8");
    expect(failure).toBeInstanceOf(AggregateError);
    expect(String(failure)).toContain(registryFile);
    expect(retained).toContain(record.recordPath);
    expect(attempted.record.status).toBe("cleanup-failed");
    expect(cleaned.record.status).toBe("cleaned");

    dockerReady = true;
    await lifecycle.afterExecutor(context, inputs);
    const recovered = await readManagedResourceRun(cwd, record.recordPath);
    expect(recovered.record.status).toBe("cleaned");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("cleanup refuses a registry replaced with a link to another executor's records", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-registry-link-"));
  const projects: string[] = [];
  const lifecycle = createTestResourceLifecycle(async ({ args = [] }) => {
    projects.push(args[args.indexOf("--project-name") + 1] ?? "");
    return { exitCode: 0, output: "", signal: null };
  });
  const context: ExecutorContext = {
    id: "ticket",
    cwd,
    worktreePath: cwd,
    phase: "implement",
    role: { provider: codex("fixture") },
  };
  try {
    const inputs = await lifecycle.beforeExecutor(context);
    const siblingInputs = await lifecycle.beforeExecutor({ ...context, id: "sibling" });
    const registry = inputs?.env?.IAM_TEST_RESOURCE_REGISTRY;
    const siblingRegistry = siblingInputs?.env?.IAM_TEST_RESOURCE_REGISTRY;
    if (!registry || !siblingRegistry) throw new Error("Expected both registries");
    await createManagedResourceRun({
      root: cwd,
      composeFile: "compose.yaml",
      project: "sibling-project",
      registryFile: siblingRegistry,
    });
    await unlink(join(cwd, registry));
    await symlink(join(cwd, siblingRegistry), join(cwd, registry));

    const failure = await lifecycle.afterExecutor(context, inputs).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain(registry);
    expect(projects).toEqual([]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
