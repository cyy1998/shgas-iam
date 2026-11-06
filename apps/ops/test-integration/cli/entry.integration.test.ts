import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";

const opsRoot = fileURLToPath(new URL("../../", import.meta.url));
const operations = [
  ["user-document", "backfill"],
  ["user-document", "repair"],
  ["user-document", "verify-postgres"],
  ["user-document", "verify-redis"],
  ["organization-document", "backfill"],
  ["organization-document", "repair"],
  ["organization-document", "verify"],
  ["session", "inventory"],
  ["session", "apply"],
  ["session", "verify"],
  ["client-snapshot", "repair"],
  ["client-snapshot", "verify"],
  ["employment", "verify"],
  ["audit-action", "inventory"],
  ["audit-action", "apply"],
  ["audit-action", "verify"],
];

test("formal Ops help discovers every maintenance group without resource configuration", async () => {
  const result = await runProcessCommandSmoke({
    label: "Ops CLI help",
    expectedExitCode: 0,
    completionTimeoutMs: 10_000,
    cleanupTimeoutMs: 5_000,
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts", "--help"],
        cwd: opsRoot,
        env: { ...process.env, IAM_OPS_DATABASE_URL: undefined, IAM_OPS_REDIS_URL: undefined },
      }),
  });
  for (const group of [
    "user-document",
    "organization-document",
    "session",
    "client-snapshot",
    "employment",
    "audit-action",
  ])
    expect(result.output).toContain(group);
}, 20_000);

test.each(operations)(
  "%s %s help is reachable without opening maintenance resources",
  async (group, operation) => {
    const result = await runProcessCommandSmoke({
      label: "Ops command help",
      expectedExitCode: 0,
      completionTimeoutMs: 10_000,
      cleanupTimeoutMs: 5_000,
      start: () =>
        spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "run", "src/index.ts", group!, operation!, "--help"],
          cwd: opsRoot,
          env: { ...process.env, IAM_OPS_DATABASE_URL: "private-invalid-url", IAM_OPS_REDIS_URL: "invalid-redis-url" },
        }),
    });
    expect(result.output).toContain(`iam-ops ${group} ${operation}`);
    expect(result.output).not.toContain("private-invalid-url");
  },
  20_000,
);

test("missing Ops configuration identifies its key and ignores the old Worker connection", async () => {
  const result = await runProcessCommandSmoke({
    label: "Ops configuration boundary",
    expectedExitCode: 1,
    completionTimeoutMs: 10_000,
    cleanupTimeoutMs: 5_000,
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts", "employment", "verify"],
        cwd: opsRoot,
        env: {
          ...process.env,
          IAM_OPS_DATABASE_URL: "",
          IAM_WORKER_DATABASE_URL: "postgresql://private-old-worker/iam",
        },
      }),
  });
  expect(result.output).toContain("IAM_OPS_DATABASE_URL");
  expect(result.output).not.toContain("private-old-worker");
  expect(result.output).not.toContain("verification completed");
}, 20_000);

test.each([
  { args: ["user-document", "destroy"] },
  { args: ["user-document", "constructor"] },
  { args: ["__proto__", "repair"] },
])(
  "unknown Ops command %j fails before maintenance configuration or connections",
  async ({ args }) => {
    const result = await runProcessCommandSmoke({
      label: "Ops invalid command",
      expectedExitCode: 2,
      completionTimeoutMs: 10_000,
      cleanupTimeoutMs: 5_000,
      start: () =>
        spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "run", "src/index.ts", ...args],
          cwd: opsRoot,
          env: { ...process.env, IAM_OPS_DATABASE_URL: "private-invalid-url", IAM_OPS_REDIS_URL: undefined },
        }),
    });
    expect(result.output).toContain("Unknown Ops command");
    expect(result.output).not.toContain("private-invalid-url");
  },
  20_000,
);
