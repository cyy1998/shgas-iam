import { expect, test } from "bun:test";
import process from "node:process";
import { spawnOwnedProcessTree } from "@iam/runtime/process";

test("rejects spawning an owned process tree on a non-Linux host", () => {
  const platform = process.platform;
  Object.defineProperty(process, "platform", { value: "freebsd" });
  try {
    expect(() =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: [],
        cwd: process.cwd(),
        env: {},
      }),
    ).toThrow("Owned process trees require Linux or WSL2 (current platform: freebsd)");
  } finally {
    Object.defineProperty(process, "platform", { value: platform });
  }
});
