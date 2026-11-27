import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentProvider, run } from "@ai-hero/sandcastle";
import { runCommand } from "./git.ts";
import { createRepoSessionFactory, resolveHostPnpmStore } from "./session.ts";

const COMPLETE = "<promise>COMPLETE</promise>";

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

  const hostStore = resolveHostPnpmStore(cwd, process.env);
  await mkdir(hostStore, { recursive: true });

  const root = await mkdtemp(join(tmpdir(), "sandcastle-smoke-"));
  const turboCacheDir = join(root, ".sandcastle", "cache", "turbo");
  const authPath = join(root, "smoke-auth.json");
  const authContent = '{"token":"smoke-fixture"}\n';
  const probeToken = `sandcastle-smoke-${randomUUID()}`;
  const git = (...args: string[]) => runCommand("git", args, root);
  console.log(`Sandcastle Plan X smoke fixture ${root}`);

  // Local host loopback listener used to verify containers do NOT run with --network=host.
  const hostLoopbackProbe = createServer((_req, res) => res.end(probeToken));
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
      hostLoopbackProbe.once("error", fail);
      hostLoopbackProbe.listen(0, "127.0.0.1", ok);
    });
    const address = hostLoopbackProbe.address();
    assert(address && typeof address === "object");

    const createSession = createRepoSessionFactory({
      cwd: root,
      env: { CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: authPath },
      imageName,
      hostStore,
      turboCacheDir,
    });

    // 1. Read-only review session on a linked worktree (matches real review execution):
    // worktree RO, auth RO, no docker.sock, no docker CLI, no --network=host, no pnpm-store, no turbo cache.
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
if command -v docker >/dev/null 2>&1; then exit 1; fi
test ! -e /home/agent/.pnpm-store
test ! -e /home/agent/.turbo-cache
test ! -e /home/agent/.docker/config.json
test -z "\${DOCKER_HOST:-}"
if env | grep -Eq '^IAM_TEST_(POSTGRES_URL|REDIS_URL|APISIX_ADMIN_(URL|KEY))='; then exit 1; fi
test ! -e /tmp/iam-test-infra
if [ "$(curl --noproxy '*' --silent --max-time 2 http://127.0.0.1:${address.port} 2>/dev/null || true)" = '${probeToken}' ]; then exit 1; fi
printf '%s\\n' '${COMPLETE}'`),
        sandbox: ro.sandbox,
        branchStrategy: { type: "head" },
        prompt: "Read-only Plan X Docker smoke probe.",
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

    // 2. Writable Plan X unprivileged session on host-owned worktree (head mode):
    // zero docker.sock / docker CLI / --network=host, dedicated loopback endpoints,
    // offline pnpm install, Turbo cache, .husky/pre-commit, and real native PG+Redis+etcd+APISIX integration.
    const worktreeDir = join(root, ".sandcastle", "worktrees", "smoke");
    await git("worktree", "add", "-b", "smoke", worktreeDir, "smoke-base");
    const rw = await createSession({ worktree: worktreeDir, readonly: false, runId: "smoke-rw" });
    activeCleanup = rw.cleanup;
    try {
      const rwResult = await run({
        cwd: worktreeDir,
        agent: probeAgent(`set -eu
test -x node_modules/.bin/lint-staged
test ! -e /var/run/docker.sock
if command -v docker >/dev/null 2>&1; then exit 1; fi
test -z "\${DOCKER_HOST:-}"
test "$IAM_TEST_POSTGRES_URL" = postgresql://iam_test:iam_test@127.0.0.1:55432/iam_test
test "$IAM_TEST_REDIS_URL" = redis://127.0.0.1:56379/0
test "$IAM_TEST_APISIX_ADMIN_URL" = http://127.0.0.1:59180/apisix/admin
test "$IAM_TEST_APISIX_ADMIN_KEY" = iam-gateway-integration-admin-key
test "$TURBO_CACHE_DIR" = /home/agent/.turbo-cache
test -d /home/agent/.turbo-cache
printf '%s\\n' '${probeToken}' > "$TURBO_CACHE_DIR/smoke-probe"
test "$(git config --get core.hooksPath)" = .husky
test -x .husky/pre-commit
if env | grep -Eq '^(GH_TOKEN|GITHUB_TOKEN)='; then exit 1; fi
if (printf '' >> .git) 2>/dev/null || git config --local smoke.rw true 2>/dev/null; then exit 1; fi
if [ "$(curl --noproxy '*' --silent --max-time 2 http://127.0.0.1:${address.port} 2>/dev/null || true)" = '${probeToken}' ]; then exit 1; fi
pnpm test:integration -- \\
  --file apps/admin-api/test-integration/resources/redis-resource-lifecycle.integration.test.ts \\
  --file apps/gateway/test-integration/preview/preview.integration.test.ts
test "$(redis-cli -p 56379 -n 31 PING)" = PONG
printf '#    Sandcastle smoke\\n' > sandcastle-smoke.md
git add sandcastle-smoke.md
git commit -m 'Probe the repository pre-commit hook'
printf '%s\\n' '${COMPLETE}'`),
        sandbox: rw.sandbox,
        hooks: rw.hooks,
        branchStrategy: { type: "head" },
        prompt: "Writable Plan X Docker smoke probe.",
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
    assert.equal((await readFile(join(turboCacheDir, "smoke-probe"), "utf8")).trim(), probeToken);
    await git("worktree", "remove", worktreeDir);
    assert.equal((await git("worktree", "list", "--porcelain")).match(/^worktree /gm)?.length, 1);
    assert.equal(await readFile(join(root, ".git", "config"), "utf8"), hostConfig);
    console.log("Sandcastle Plan X unprivileged Docker smoke passed.");
  } finally {
    await new Promise<void>((ok) => hostLoopbackProbe.close(() => ok()));
    await activeCleanup?.().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}
