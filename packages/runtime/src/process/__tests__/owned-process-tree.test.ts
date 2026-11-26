import { expect, test } from "bun:test";
import process from "node:process";
import { closeOwnedProcessScope, spawnOwnedProcessTree } from "@iam/runtime/process";

test("rejects spawning an owned process tree on a non-Linux host before reading its scope", () => {
  const platform = process.platform;
  Object.defineProperty(process, "platform", { value: "freebsd" });
  try {
    expect(() =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: [],
        cwd: process.cwd(),
        env: { IAM_OWNED_PROCESS_SCOPE_ID: "invalid" },
      }),
    ).toThrow("Owned process trees require Linux or WSL2 (current platform: freebsd)");
  } finally {
    Object.defineProperty(process, "platform", { value: platform });
  }
});

test("rejects recovering an owned process scope on a non-Linux host before validating the scope", async () => {
  const platform = process.platform;
  Object.defineProperty(process, "platform", { value: "freebsd" });
  let cleanup: Promise<void>;
  try {
    cleanup = closeOwnedProcessScope("invalid", { timeoutMs: 500, forceAfterMs: 100 });
  } finally {
    Object.defineProperty(process, "platform", { value: platform });
  }
  const failure: unknown = await cleanup.catch((error: unknown) => error);
  expect(failure).toMatchObject({
    message: "Owned process trees require Linux or WSL2 (current platform: freebsd)",
  });
});
