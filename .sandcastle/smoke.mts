import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type AgentProvider, run } from "@ai-hero/sandcastle";
import { runCommand } from "./git.ts";
import { createRepoSessionFactory } from "./session.ts";

const COMPLETE = "<promise>COMPLETE</promise>";
const DOCKER_SOCKET = "/var/run/docker.sock";

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
  await runCommand("docker", ["image", "inspect", imageName, "--format", "{{.Id}}"], cwd);
  const socketInfo = await stat(DOCKER_SOCKET);
  if (!socketInfo.isSocket()) throw new Error(`Expected Docker socket at ${DOCKER_SOCKET}.`);

  const hostStore = resolve(cwd, process.env.SANDCASTLE_PNPM_STORE_DIR?.trim() || join(homedir(), ".pnpm-store"));
  await mkdir(hostStore, { recursive: true });

  const root = await mkdtemp(join(tmpdir(), "sandcastle-smoke-"));
  const turboCacheDir = join(root, ".sandcastle", "cache", "turbo");
  const authPath = join(root, "smoke-auth.json");
  const authContent = '{"token":"smoke-fixture"}\n';
  const project = `sandcastle-smoke-${randomUUID()}`;
  const network = `${project}_default`;
  const git = (...args: string[]) => runCommand("git", args, root);
  console.log(`Sandcastle smoke fixture ${root}, Compose project ${project}`);

  const probe = createServer((_req, res) => res.end(project));
  let activeCleanup: (() => Promise<void>) | undefined;
  try {
    await git("init", "--quiet");
    await git("fetch", "--quiet", "--depth=1", cwd, "HEAD");
    await git("switch", "--quiet", "-c", "smoke-base", "FETCH_HEAD");
    await git("config", "user.name", "Sandcastle smoke");
    await git("config", "user.email", "smoke@example.invalid");
    await git("config", "core.hooksPath", ".husky/_");
    await writeFile(authPath, authContent, { mode: 0o600 });
    await mkdir(turboCacheDir, { recursive: true });
    const logsDir = join(root, ".sandcastle", "logs");
    await mkdir(logsDir, { recursive: true, mode: 0o700 });
    const hostConfig = await readFile(join(root, ".git", "config"), "utf8");

    await new Promise<void>((ok, fail) => {
      probe.once("error", fail);
      probe.listen(0, "127.0.0.1", ok);
    });
    const address = probe.address();
    assert(address && typeof address === "object");

    const createSession = createRepoSessionFactory({
      cwd: root,
      env: { CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: authPath },
      imageName,
      hostStore,
      turboCacheDir,
      dockerGid: socketInfo.gid,
    });

    // 1. Read-only review session on a linked worktree (matches real review execution):
    // worktree RO, auth RO, no docker.sock, no pnpm-store, no turbo cache.
    const roWorktreeDir = join(root, ".sandcastle", "worktrees", "smoke-ro");
    await git("worktree", "add", "-b", "smoke-ro", roWorktreeDir, "smoke-base");
    const ro = await createSession({ worktree: roWorktreeDir, readonly: true, runId: "smoke-ro" });
    activeCleanup = ro.cleanup;
    try {
      const roResult = await run({
        cwd: roWorktreeDir,
        agent: probeAgent(`set -eu
if touch smoke-readonly-probe 2>/dev/null; then exit 1; fi
if (printf '' >> .git) 2>/dev/null || git config --local smoke.ro true 2>/dev/null; then exit 1; fi
if (printf 'tampered' > "$CODEX_HOME/auth.json") 2>/dev/null; then exit 1; fi
if env | grep -Eq '^(GH_TOKEN|GITHUB_TOKEN)='; then exit 1; fi
test ! -e /var/run/docker.sock
test ! -e /home/agent/.pnpm-store
test ! -e /home/agent/.turbo-cache
test ! -e /home/agent/.docker/config.json
test -z "\${DOCKER_HOST:-}"
printf '%s\n' '${COMPLETE}'`),
        sandbox: ro.sandbox,
        branchStrategy: { type: "head" },
        prompt: "Read-only Docker smoke probe.",
        logging: { type: "file", path: join(logsDir, "smoke-ro.log") },
        completionSignal: COMPLETE,
        maxIterations: 1,
      });
      assert.equal(roResult.completionSignal, COMPLETE);
    } finally {
      await ro.cleanup?.();
      activeCleanup = undefined;
    }
    await git("worktree", "remove", roWorktreeDir);
    assert.equal(await readFile(authPath, "utf8"), authContent);

    // 2. Writable session on host-owned worktree (head mode): pnpm offline, turbo cache, hooks, Docker cleanup.
    const worktreeDir = join(root, ".sandcastle", "worktrees", "smoke");
    await git("worktree", "add", "-b", "smoke", worktreeDir, "smoke-base");
    const rw = await createSession({ worktree: worktreeDir, readonly: false, runId: "smoke-rw" });
    activeCleanup = rw.cleanup;
    try {
      const rwResult = await run({
        cwd: worktreeDir,
        agent: probeAgent(String.raw`set -eu
test -x node_modules/.bin/lint-staged
test "$TURBO_CACHE_DIR" = /home/agent/.turbo-cache
test -d /home/agent/.turbo-cache
printf '%s\n' '${project}' > "$TURBO_CACHE_DIR/smoke-probe"
test "$(git config --get core.hooksPath)" = .husky
test -x .husky/pre-commit
if env | grep -Eq '^(GH_TOKEN|GITHUB_TOKEN)='; then exit 1; fi
if (printf '' >> .git) 2>/dev/null || git config --local smoke.rw true 2>/dev/null; then exit 1; fi
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
printf '%s\n' '${COMPLETE}'`),
        sandbox: rw.sandbox,
        hooks: rw.hooks,
        branchStrategy: { type: "head" },
        prompt: "Writable Docker smoke probe.",
        logging: { type: "file", path: join(logsDir, "smoke-rw.log") },
        completionSignal: COMPLETE,
        maxIterations: 1,
      });
      assert.equal(rwResult.completionSignal, COMPLETE);
    } finally {
      await rw.cleanup?.();
      activeCleanup = undefined;
    }

    assert.equal(await git("show", "smoke:sandcastle-smoke.md"), "# Sandcastle smoke");
    assert.equal((await readFile(join(turboCacheDir, "smoke-probe"), "utf8")).trim(), project);
    assert.equal(
      await runCommand(
        "docker",
        ["network", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`],
        root,
      ),
      "",
    );
    assert.deepEqual(await readdir(join(root, ".sandcastle", "resources")), []);
    assert.deepEqual(await readdir(join(worktreeDir, ".sandcastle", "resources")), []);
    await git("worktree", "remove", worktreeDir);
    assert.equal((await git("worktree", "list", "--porcelain")).match(/^worktree /gm)?.length, 1);
    assert.equal(await readFile(join(root, ".git", "config"), "utf8"), hostConfig);
    console.log("Sandcastle Docker smoke passed.");
  } finally {
    await new Promise<void>((ok) => probe.close(() => ok()));
    await activeCleanup?.().catch(() => {});
    await runCommand("docker", ["network", "rm", network], cwd).catch(() => {});
    const sandboxId = await readFile(join(root, "test-results/integration/sandbox-id"), "utf8")
      .then((v) => v.trim())
      .catch(() => "");
    if (/^[a-f0-9]{64}$/.test(sandboxId)) await runCommand("docker", ["rm", "-f", sandboxId], cwd).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}
