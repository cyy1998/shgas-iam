import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type AgentProvider,
  type BindMountSandboxProvider,
  run,
  type SandboxHooks,
  type SandboxProvider,
} from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { command } from "../scripts/sandcastle/core/command.ts";
import { findManagedWorktree, removeWorktreeSafe } from "../scripts/sandcastle/core/git.ts";
import { readonlySandbox } from "../scripts/sandcastle/core/index.ts";
import { withTestResources } from "./test-resources.ts";

const complete = "<promise>COMPLETE</promise>";
const sandboxStore = "/home/agent/.pnpm-store";
const dockerSocket = "/var/run/docker.sock";
const writableHooks: SandboxHooks = {
  sandbox: {
    onSandboxReady: [
      {
        command:
          "sh .sandcastle/hooks/prepare-workspace.sh </dev/null && sh .sandcastle/hooks/enable-git-hooks.sh </dev/null",
        timeoutMs: 1_200_000,
      },
    ],
  },
};

function asBindMount(provider: SandboxProvider): BindMountSandboxProvider {
  if (
    "tag" in provider &&
    provider.tag === "bind-mount" &&
    "create" in provider &&
    typeof provider.create === "function"
  ) {
    return provider as BindMountSandboxProvider;
  }
  throw new Error(`Expected bind-mount sandbox provider, got "${provider.name}".`);
}

function probeAgent(script: string): AgentProvider {
  return {
    name: "smoke",
    env: {},
    captureSessions: false,
    parseStreamLine: (line) => [{ type: "text", text: line }],
    buildPrintCommand: () => ({ command: script }),
  };
}

export async function smoke(cwd: string): Promise<void> {
  const imageName = process.env.SANDCASTLE_IMAGE?.trim() || "iam-sandcastle:local";
  await command("docker", ["image", "inspect", imageName, "--format", "{{.Id}}"], cwd);
  const socketInfo = await stat(dockerSocket);
  if (!socketInfo.isSocket()) throw new Error(`Expected a Docker socket at ${dockerSocket}.`);

  const hostStore = resolve(cwd, process.env.SANDCASTLE_PNPM_STORE_DIR?.trim() || join(homedir(), ".pnpm-store"));
  await mkdir(hostStore, { recursive: true });

  const root = await mkdtemp(join(tmpdir(), "sandcastle-smoke-"));
  const project = `sandcastle-smoke-${randomUUID()}`;
  const network = `${project}_default`;
  const git = (...args: string[]) => command("git", args, root);
  console.log(`Sandcastle smoke fixture ${root}, Compose project ${project}`);

  const probe = createServer((_request, response) => response.end(project));
  let managedCleanup: (() => Promise<void>) | undefined;
  try {
    await git("init", "--quiet");
    await git("fetch", "--quiet", "--depth=1", cwd, "HEAD");
    await git("switch", "--quiet", "-c", "smoke-base", "FETCH_HEAD");
    await git("config", "user.name", "Sandcastle smoke");
    await git("config", "user.email", "smoke@example.invalid");
    await git("config", "core.hooksPath", ".husky/_");
    const configPath = join(root, ".git", "config");
    const hostConfig = await readFile(configPath, "utf8");
    const logsDir = join(root, ".sandcastle", "logs");
    await mkdir(logsDir, { recursive: true, mode: 0o700 });

    await new Promise<void>((resolveListen, rejectListen) => {
      probe.once("error", rejectListen);
      probe.listen(0, "127.0.0.1", resolveListen);
    });
    const address = probe.address();
    assert(address && typeof address === "object");

    // 1. Read-only review sandbox
    const readOnlyDocker = asBindMount(
      docker({ imageName, mounts: [{ hostPath: hostStore, sandboxPath: sandboxStore, readonly: true }], env: {} }),
    );
    const readOnlyResult = await run({
      cwd: root,
      agent: probeAgent(`set -eu
if touch smoke-readonly-probe 2>/dev/null; then echo 'Worktree is writable' >&2; exit 1; fi
if (printf '' >> .git/HEAD) 2>/dev/null || git config --local smoke.ro true 2>/dev/null; then echo 'Git controls are writable' >&2; exit 1; fi
if env | grep -Eq '^(GH_TOKEN|GITHUB_TOKEN)='; then echo 'GitHub credentials reached read-only sandbox' >&2; exit 1; fi
test ! -e /var/run/docker.sock
test -z "\${DOCKER_HOST:-}"
test ! -e /tmp/iam-sandcastle-hooks/pre-commit
printf '%s\n' '${complete}'`),
      sandbox: readonlySandbox(readOnlyDocker),
      branchStrategy: { type: "head" },
      prompt: "Run the read-only Docker smoke probe.",
      logging: { type: "file", path: join(logsDir, "smoke-readonly.log") },
      completionSignal: complete,
      maxIterations: 1,
    });
    assert.equal(readOnlyResult.completionSignal, complete, "Read-only sandbox probe did not complete.");

    // 2. Writable implement sandbox
    const writableDocker = docker({
      imageName,
      mounts: [
        { hostPath: hostStore, sandboxPath: sandboxStore },
        { hostPath: dockerSocket, sandboxPath: dockerSocket },
      ],
      env: {
        IAM_AFK_PNPM_STORE_DIR: sandboxStore,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.hooksPath",
        GIT_CONFIG_VALUE_0: "/tmp/iam-sandcastle-hooks",
        DOCKER_HOST: `unix://${dockerSocket}`,
      },
      groups: [socketInfo.gid],
      network: "host",
    });
    const managed = withTestResources({ cwd: root, id: "smoke", sandbox: writableDocker });
    managedCleanup = managed.cleanup;

    const writableResult = await run({
      cwd: root,
      agent: probeAgent(String.raw`set -eu
test -x node_modules/.bin/lint-staged
test "$(git config --get core.hooksPath)" = /tmp/iam-sandcastle-hooks
test -x /tmp/iam-sandcastle-hooks/pre-commit
if env | grep -Eq '^(GH_TOKEN|GITHUB_TOKEN)='; then echo 'GitHub credentials reached writable sandbox' >&2; exit 1; fi
if (printf '' >> .git) 2>/dev/null || git config --local smoke.rw true 2>/dev/null; then echo 'Git controls are writable' >&2; exit 1; fi
test "$(curl --silent --show-error --fail --max-time 10 http://127.0.0.1:${address.port})" = '${project}'
sandbox_id=$(docker ps -q --no-trunc --filter "volume=$PWD/$(dirname "$IAM_TEST_RESOURCE_REGISTRY")")
test -n "$sandbox_id"
test "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$sandbox_id")" = host
printf '%s\n' "$sandbox_id" > test-results/integration/sandbox-id
node --input-type=module <<'JS'
import { writeFile } from 'node:fs/promises';
import { createManagedResourceRun } from './scripts/test-resources/managed-resources.mjs';
const composeFile = 'test-results/integration/smoke-compose.yaml';
await writeFile(composeFile, 'services:\n  unused:\n    image: scratch\n');
await createManagedResourceRun({ root: process.cwd(), composeFile, project: '${project}', registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY });
JS
docker network create --label com.docker.compose.project=${project} --label com.docker.compose.network=default ${network}
printf '#    Sandcastle smoke\n' > sandcastle-smoke.md
git add sandcastle-smoke.md
git commit -m 'Probe the repository pre-commit hook'
printf '%s\n' '${complete}'`),
      sandbox: managed.sandbox,
      hooks: writableHooks,
      branchStrategy: { type: "branch", branch: "smoke" },
      prompt: "Run the writable Docker smoke probe.",
      logging: { type: "file", path: join(logsDir, "smoke-writable.log") },
      completionSignal: complete,
      maxIterations: 1,
    });
    await managed.cleanup();

    assert.equal(writableResult.completionSignal, complete, "Writable sandbox probe did not complete.");
    assert.equal(await git("show", "smoke:sandcastle-smoke.md"), "# Sandcastle smoke");
    const sandboxId = (await readFile(join(root, "test-results/integration/sandbox-id"), "utf8")).trim();
    assert.match(sandboxId, /^[a-f0-9]{64}$/);
    assert.equal(await command("docker", ["ps", "-aq", "--no-trunc", "--filter", `id=${sandboxId}`], root), "");
    assert.equal(
      await command("docker", ["network", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`], root),
      "",
    );
    assert.deepEqual(await readdir(join(root, ".sandcastle", "resources")), []);

    const smokeWorktree = await findManagedWorktree(root, "smoke");
    if (smokeWorktree) await removeWorktreeSafe(root, smokeWorktree);
    assert.equal((await git("worktree", "list", "--porcelain")).match(/^worktree /gm)?.length, 1);
    assert.equal(await readFile(configPath, "utf8"), hostConfig);
    console.log("Sandcastle Docker smoke passed.");
  } finally {
    await new Promise<void>((resolveClose) => probe.close(() => resolveClose()));
    await managedCleanup?.().catch(() => {});
    await command("docker", ["network", "rm", network], cwd).catch(() => {});
    const sandboxId = await readFile(join(root, "test-results/integration/sandbox-id"), "utf8")
      .then((value) => value.trim())
      .catch(() => "");
    if (/^[a-f0-9]{64}$/.test(sandboxId)) {
      await command("docker", ["rm", "-f", sandboxId], cwd).catch(() => {});
    }
    await rm(root, { recursive: true, force: true });
  }
}
