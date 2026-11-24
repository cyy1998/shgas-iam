import { expect, test } from "bun:test";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { withOwnedTemporaryDirectory } from "@iam/test-support/process-smoke-harness";
import { prepareWorkerStandalone } from "../support/standalone-build";

test("reuses both standalone executables and the supervisor until a source or lockfile changes", async () => {
  await withStandaloneInputs(async (root) => {
    let compilations = 0;
    const prepare = () =>
      prepareWorkerStandalone({
        repositoryRoot: root,
        async compile(entry, output) {
          compilations += 1;
          await writeFile(output, await readFile(entry));
        },
      });
    const first = await prepare();
    const warm = await prepare();
    expect(warm).toBe(first);
    expect(compilations).toBe(2);
    const launcher = await readFile(join(dirname(warm), "windows-job-launcher.exe"), "utf8");
    const supervisor = await readFile(join(dirname(warm), "windows-job-supervisor.ps1"), "utf8");
    expect(launcher).toBe("launcher");
    expect(supervisor).toBe("supervisor");

    await writeFile(join(root, "packages/runtime/src/process/windows-job-launcher.mjs"), "updated launcher");
    const updated = await prepare();
    expect(updated).not.toBe(first);
    const updatedLauncher = await readFile(join(dirname(updated), "windows-job-launcher.exe"), "utf8");
    expect(updatedLauncher).toBe("updated launcher");
    expect(compilations).toBe(4);

    await writeFile(join(root, "pnpm-lock.yaml"), "updated lock");
    const relocked = await prepare();
    expect(relocked).not.toBe(updated);
    expect(compilations).toBe(6);

    await rm(join(dirname(relocked), "windows-job-launcher.exe"));
    const recovered = await prepare();
    const recoveredLauncher = await readFile(join(dirname(recovered), "windows-job-launcher.exe"), "utf8");
    expect(recoveredLauncher).toBe("updated launcher");
    expect(compilations).toBe(8);
  });
});

test("a failed standalone compilation never publishes an incomplete build", async () => {
  await withStandaloneInputs(async (root) => {
    const cache = join(root, ".cache", "integration-worker-standalone");
    let failure: unknown;
    try {
      await prepareWorkerStandalone({
        repositoryRoot: root,
        async compile(entry, output) {
          if (entry.endsWith(".mjs")) throw new Error("controlled launcher build failure");
          await writeFile(output, "worker");
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(new Error("controlled launcher build failure"));
    const entries = await readdir(cache);
    expect(entries).toEqual([]);
  });
});

async function withStandaloneInputs(run: (root: string) => Promise<void>) {
  await withOwnedTemporaryDirectory({
    prefix: "iam-standalone-cache-test-",
    cleanupTimeoutMs: 5_000,
    async run(root) {
      for (const [path, content] of [
        ["apps/worker/src/index.ts", "worker"],
        ["packages/runtime/src/process/windows-job-launcher.mjs", "launcher"],
        ["packages/runtime/src/process/windows-job-supervisor.ps1", "supervisor"],
        ["pnpm-lock.yaml", "lock"],
      ] as const) {
        const file = join(root, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, content);
      }
      await run(root);
    },
  });
}
