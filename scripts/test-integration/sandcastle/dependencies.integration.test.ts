import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { command } from "../../sandcastle/commands.ts";
import { recoverExecutorResources, stopExecutorSandbox, withExecutorResources } from "../../sandcastle/resources.ts";
import { dockerSandbox } from "../../sandcastle/sandbox.mts";
import { dependencyVolumeTargets } from "../../sandcastle/workspace-dependencies.mts";

async function cleanupExitedSandbox(root: string, containerName: string, receipt: string) {
  await stopExecutorSandbox(root, containerName);
  try {
    await command("docker", ["rm", "--volumes", containerName], root);
  } catch (error) {
    if (!String(error).includes("No such container")) throw error;
  }
  const recorded: string[] = JSON.parse(await readFile(receipt, "utf8").catch(() => "[]"));
  for (const volume of recorded) {
    if (!/^[a-f0-9]{64}$/.test(volume)) throw new Error("Invalid probe volume identity");
    try {
      await command("docker", ["volume", "rm", volume], root);
    } catch (error) {
      if (!/no such volume/i.test(String(error))) throw error;
    }
  }
}

test.each(["sdk-close", "executor-recovery", "container-removed-before-volume-cleanup"])(
  "private dependency volumes support %s without poisoning the host worktree",
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "iam-afk-dependency-test-"));
    const cwd = join(root, "repository");
    const checkout = join(root, "ticket");
    const git = (...args: string[]) => command("git", args, cwd);
    let succeeded = false;
    try {
      await mkdir(cwd);
      await git("init", "--initial-branch=main");
      await git("config", "user.name", "Dependency fixture");
      await git("config", "user.email", "fixture@example.invalid");
      await git("config", "core.hooksPath", join(root, "no-hooks"));
      await writeFile(join(cwd, ".gitignore"), "node_modules/\n.sandcastle/\ntest-results/\n");
      await git("add", ".gitignore");
      await git("commit", "-m", "base");
      await git("worktree", "add", "-b", "ticket", checkout);
      for (const path of ["node_modules", "apps/min/node_modules"]) {
        await mkdir(join(checkout, path), { recursive: true });
        await writeFile(join(checkout, path, "host-sentinel"), "host dependencies\n");
      }
      const volumes: string[] = [];
      await withExecutorResources(
        {
          cwd,
          image: "iam-sandcastle:local",
          signal: new AbortController().signal,
          anonymousVolumes: ["/home/agent/workspace/node_modules", "/home/agent/workspace/apps/min/node_modules"],
        },
        async (resources) => {
          const provider = dockerSandbox({
            ...resources,
            imageName: "iam-sandcastle:local",
            anonymousVolumes: ["/home/agent/workspace/node_modules", "/home/agent/workspace/apps/min/node_modules"],
          });
          const handle = await provider.create({
            hostRepoPath: cwd,
            worktreePath: checkout,
            mounts: [{ hostPath: checkout, sandboxPath: "/home/agent/workspace" }],
            env: resources.env,
          });
          let removed = false;
          try {
            const result = await handle.exec(
              "test $(id -u) = 1000 && test ! -e node_modules/host-sentinel && test ! -e apps/min/node_modules/host-sentinel && mkdir -p node_modules/target apps/min/node_modules/target && ln -s target node_modules/link && ln -s target apps/min/node_modules/link",
            );
            expect(result.exitCode).toBe(0);
            const mounts: { Type: string; Name: string; Destination: string }[] = JSON.parse(
              await command("docker", ["inspect", "--format", "{{json .Mounts}}", resources.containerName], cwd),
            );
            volumes.push(...mounts.filter((entry) => entry.Type === "volume").map((entry) => entry.Name));
            expect(volumes).toHaveLength(2);
            const descriptor = resources.registryFile.replace("registry.jsonl", "executor.json");
            const recorded = JSON.parse(await readFile(join(cwd, descriptor), "utf8"));
            expect(new Set(recorded.dependencyVolumes)).toEqual(new Set(volumes));
            for (const path of ["node_modules", "apps/min/node_modules"]) {
              const names = await readdir(join(checkout, path));
              expect(names).toEqual(["host-sentinel"]);
              const original = await readFile(join(checkout, path, "host-sentinel"), "utf8");
              expect(original).toBe("host dependencies\n");
            }
            if (scenario === "sdk-close") await handle.close();
            else {
              if (scenario === "container-removed-before-volume-cleanup") {
                await stopExecutorSandbox(cwd, resources.containerName);
                // Simulate an older/failed SDK cleanup that removed its container but left anonymous volumes.
                await command("docker", ["rm", resources.containerName], cwd);
                for (const volume of volumes)
                  expect(await command("docker", ["volume", "inspect", "--format", "{{.Name}}", volume], cwd)).toBe(
                    volume,
                  );
              }
              await recoverExecutorResources(cwd, descriptor);
            }
            removed = true;
            // Check before the outer live finalizer can repair SDK/recovery mistakes.
            for (const volume of volumes) {
              const remaining = await command(
                "docker",
                ["volume", "ls", "--filter", `name=^${volume}$`, "--format", "{{.Name}}"],
                cwd,
              );
              expect(remaining).toBe("");
            }
          } finally {
            // Before the patch, these owned links land in the host checkout. Remove only the probe links from Linux.
            if (!removed) await handle.exec("rm -f node_modules/link apps/min/node_modules/link");
            await handle.close();
          }
        },
      );
      for (const volume of volumes) {
        const remaining = await command(
          "docker",
          ["volume", "ls", "--filter", `name=^${volume}$`, "--format", "{{.Name}}"],
          cwd,
        );
        expect(remaining).toBe("");
      }
      await git("worktree", "remove", checkout);
      const worktrees = await git("worktree", "list", "--porcelain");
      expect(worktrees.match(/^worktree /gm)).toHaveLength(1);
      succeeded = true;
    } finally {
      if (succeeded) await rm(root, { recursive: true, force: true });
      else console.error(`Dependency isolation fixture retained: ${root}`);
    }
  },
  30_000,
);

test("SDK synchronous shutdown removes its exact anonymous volume", async () => {
  const root = await mkdtemp(join(tmpdir(), "iam-afk-dependency-exit-"));
  const containerName = `iam-afk-exit-${Date.now()}`;
  const receipt = join(root, "volumes.json");
  const script = join(root, "exit.mts");
  let succeeded = false;
  const failures: unknown[] = [];
  try {
    await writeFile(
      script,
      `
import { writeFile } from "node:fs/promises";
import { dockerSandbox } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "scripts/sandcastle/sandbox.mts")).href)};
import { command } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "scripts/sandcastle/commands.ts")).href)};
const provider = dockerSandbox({ imageName: "iam-sandcastle:local", containerName: ${JSON.stringify(containerName)}, anonymousVolumes: ["/home/agent/workspace/node_modules"] });
await provider.create({ hostRepoPath: ${JSON.stringify(root)}, worktreePath: ${JSON.stringify(root)}, mounts: [{hostPath: ${JSON.stringify(root)}, sandboxPath: "/home/agent/workspace"}], env: {} });
const mounts = JSON.parse(await command("docker", ["inspect", "--format", "{{json .Mounts}}", ${JSON.stringify(containerName)}], ${JSON.stringify(root)}));
await writeFile(${JSON.stringify(receipt)}, JSON.stringify(mounts.filter(entry => entry.Type === "volume").map(entry => entry.Name)));
process.exit(0);
`,
    );
    await command("node", ["--import", "tsx", script], process.cwd());
    const volumes: string[] = JSON.parse(await readFile(receipt, "utf8"));
    expect(volumes).toHaveLength(1);
    for (const volume of volumes) {
      const remaining = await command(
        "docker",
        ["volume", "ls", "--filter", `name=^${volume}$`, "--format", "{{.Name}}"],
        root,
      );
      expect(remaining).toBe("");
    }
    succeeded = true;
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await cleanupExitedSandbox(root, containerName, receipt);
    } catch (error) {
      failures.push(error);
    }
    if (succeeded) await rm(root, { recursive: true, force: true });
    else console.error(`SDK exit fixture retained: ${root}`);
  }
  if (failures.length) throw new AggregateError(failures, "SDK exit or exact cleanup failed");
}, 30_000);

test("dependency coverage follows actual pnpm workspaces and stops before installing into a new uncovered workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "iam-afk-workspace coverage-"));
  let succeeded = false;
  try {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "coverage-root",
        private: true,
        scripts: { preinstall: "node -e \"require('node:fs').writeFileSync('unexpected-install', 'started')\"" },
      }),
    );
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      "packages: ['apps/*', 'packages/*', 'e2e/system', '!apps/excluded']\n",
    );
    for (const path of ["apps/min", "packages/shared", "e2e/system", "apps/excluded", "apps/min/static/swagger"]) {
      await mkdir(join(root, path), { recursive: true });
      await writeFile(
        join(root, path, "package.json"),
        JSON.stringify({ name: path.replaceAll("/", "-"), private: true }),
      );
    }
    const targets = await dependencyVolumeTargets(root);
    expect(targets).toEqual([
      "/home/agent/workspace/apps/min/node_modules",
      "/home/agent/workspace/e2e/system/node_modules",
      "/home/agent/workspace/node_modules",
      "/home/agent/workspace/packages/shared/node_modules",
    ]);
    const originalManager = process.env.npm_execpath;
    const originalPath = process.env.PATH;
    const originalMarker = process.env.IAM_AFK_UNEXPECTED_LAUNCHER;
    try {
      delete process.env.npm_execpath;
      if (process.platform === "win32") {
        const launcher = '@echo off\r\necho executed > "%IAM_AFK_UNEXPECTED_LAUNCHER%"\r\nexit /b 91\r\n';
        await mkdir(join(root, "bin"));
        await writeFile(join(root, "pnpm.cmd"), launcher);
        await writeFile(join(root, "bin/pnpm.cmd"), launcher);
        process.env.PATH = [join(root, "bin"), ".", "", originalPath].join(delimiter);
        process.env.IAM_AFK_UNEXPECTED_LAUNCHER = join(root, "unexpected-launcher");
      }
      const withoutLifecycleEnv = await dependencyVolumeTargets(root);
      expect(withoutLifecycleEnv).toEqual(targets);
      if (process.platform === "win32") {
        await rm(join(root, "pnpm.cmd"));
        const withoutCurrentDirectoryLauncher = await dependencyVolumeTargets(root);
        expect(withoutCurrentDirectoryLauncher).toEqual(targets);
        const names = await readdir(root);
        expect(names).not.toContain("unexpected-launcher");
      }
    } finally {
      if (originalManager === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = originalManager;
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      if (originalMarker === undefined) delete process.env.IAM_AFK_UNEXPECTED_LAUNCHER;
      else process.env.IAM_AFK_UNEXPECTED_LAUNCHER = originalMarker;
    }
    await withExecutorResources(
      { cwd: root, image: "iam-sandcastle:local", signal: new AbortController().signal, anonymousVolumes: targets },
      async (resources) => {
        const handle = await dockerSandbox({ ...resources, imageName: "iam-sandcastle:local" }).create({
          hostRepoPath: root,
          worktreePath: root,
          mounts: [{ hostPath: root, sandboxPath: "/home/agent/workspace" }],
          env: resources.env,
        });
        try {
          await handle.copyFileIn(
            join(process.cwd(), "scripts/sandcastle/workspace-dependencies.mts"),
            "/tmp/workspace-dependencies.mts",
          );
          const covered = await handle.exec("node /tmp/workspace-dependencies.mts");
          expect(covered.exitCode).toBe(0);
          await mkdir(join(root, "apps/new"));
          await writeFile(
            join(root, "apps/new/package.json"),
            JSON.stringify({ name: "new-workspace", private: true }),
          );
          const uncovered = await handle.exec("node /tmp/workspace-dependencies.mts");
          expect(uncovered.exitCode).not.toBe(0);
          expect(uncovered.stderr).toContain("apps/new/node_modules");
          const names = await readdir(join(root, "apps/new"));
          expect(names).toEqual(["package.json"]);
        } finally {
          await handle.close();
        }
      },
    );
    const before = await readdir(root);
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "coverage-root", private: true, packageManager: "pnpm@0.0.0" }),
    );
    let failure: unknown;
    try {
      await dependencyVolumeTargets(root);
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain("不自动下载或切换工具版本");
    const after = await readdir(root);
    expect(after).toEqual(before);
    succeeded = true;
  } finally {
    if (succeeded) await rm(root, { recursive: true, force: true });
    else console.error(`Workspace coverage fixture retained: ${root}`);
  }
}, 30_000);
