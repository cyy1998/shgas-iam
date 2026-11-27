import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  runCommand,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/test-support/process-smoke-harness";

test("reaps a detached descendant that inherited the exited leader's stdio", async () => {
  const { output } = await runCommand({
    label: "detached process smoke fixture",
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["run", fileURLToPath(new URL("../../src/__tests__/fixtures/process-smoke.fixture.ts", import.meta.url))],
        cwd: process.cwd(),
        env: process.env,
      }),
  });
  const pid = /ready (\d+)/u.exec(output)?.[1];
  expect(pid).toBeDefined();
  expect(output).toContain(`stopped ${pid}`);
  expect(existsSync(`/proc/${pid}`)).toBe(false);
});

test("removes the owned directory after a failed command", async () => {
  let ownedDirectory: string | undefined;
  let failure: unknown;
  try {
    await withOwnedTemporaryDirectory({
      prefix: "iam-process-test-",
      async run(directory) {
        ownedDirectory = directory;
        await runCommand({
          label: "failed command",
          start: () =>
            spawnOwnedProcessTree({
              executable: process.execPath,
              args: ["-e", 'console.error("command failed"); process.exit(7)'],
              cwd: directory,
              env: process.env,
            }),
        });
      },
    });
  } catch (error) {
    failure = error;
  }
  expect(String(failure)).toContain("exited with 7");
  expect(String(failure)).toContain("command failed");
  expect(ownedDirectory).toBeDefined();
  expect(existsSync(ownedDirectory!)).toBe(false);
});
