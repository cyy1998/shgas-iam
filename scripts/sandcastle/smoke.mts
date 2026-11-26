import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentProvider, createWorktree } from "@ai-hero/sandcastle";
import { loadRepoSandcastleConfig } from "../../.sandcastle/config.ts";
import { command } from "./core/command.ts";
import { completed, createExecutor } from "./core/executor.ts";
import { complete } from "./core/prompts/index.ts";

export async function smoke(cwd: string) {
  const root = await mkdtemp(join(tmpdir(), "sandcastle-smoke-"));
  const project = `sandcastle-smoke-${randomUUID()}`;
  const network = `${project}_default`;
  const git = (...args: string[]) => command("git", args, root);
  console.log(`Sandcastle smoke fixture ${root}, Compose project ${project}`);
  await git("init", "--quiet");
  await git("fetch", "--quiet", "--depth=1", cwd, "HEAD");
  await git("switch", "--quiet", "-c", "smoke-base", "FETCH_HEAD");
  await git("config", "user.name", "Sandcastle smoke");
  await git("config", "user.email", "smoke@example.invalid");
  await git("config", "core.hooksPath", ".husky/_");
  const configPath = join(root, ".git", "config");
  const hostConfig = await readFile(configPath, "utf8");
  const worktree = await createWorktree({ cwd: root, branchStrategy: { type: "branch", branch: "smoke" } });
  const probe = createServer((_request, response) => response.end(project));
  try {
    await new Promise<void>((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", resolve);
    });
    const address = probe.address();
    assert(address && typeof address === "object");
    const agent: AgentProvider = {
      name: "smoke",
      env: {},
      captureSessions: false,
      parseStreamLine: (line) => [{ type: "text", text: line }],
      buildPrintCommand: () => ({
        command: String.raw`set -eu
test -x node_modules/.bin/lint-staged
test "$(git config --get core.hooksPath)" = /tmp/iam-sandcastle-hooks
test -x /tmp/iam-sandcastle-hooks/pre-commit
if env | grep -Eq '^(GH_TOKEN|GITHUB_TOKEN)='; then
  echo 'GitHub credentials reached the writable sandbox' >&2
  exit 1
fi
if (printf '' >> .git) 2>/dev/null || git config --local smoke.writable true; then
  echo 'Native Git controls are writable' >&2
  exit 1
fi
test "$(curl --silent --show-error --fail --max-time 10 http://127.0.0.1:${address.port})" = '${project}'
sandbox_id=$(docker ps -q --no-trunc --filter "volume=$PWD/$(dirname "$IAM_TEST_RESOURCE_REGISTRY")")
test "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$sandbox_id")" = host
printf '%s\n' "$sandbox_id" > test-results/integration/sandbox-id
node --input-type=module <<'JS'
import { writeFile } from 'node:fs/promises';
import { createManagedResourceRun } from './scripts/test-resources/managed-resources.mjs';
const composeFile = 'test-results/integration/smoke-compose.yaml';
await writeFile(composeFile, 'services:\n  unused:\n    image: scratch\n');
await createManagedResourceRun({ root: process.cwd(), composeFile, project: '${project}',
  registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY });
JS
docker network create --label com.docker.compose.project=${project} --label com.docker.compose.network=default ${network}
printf '#    Sandcastle smoke\n' > sandcastle-smoke.md
git add sandcastle-smoke.md
git commit -m 'Probe the repository pre-commit hook'
printf '%s\n' '${complete}'`,
      }),
    };
    const { SANDCASTLE_IMAGE, SANDCASTLE_PNPM_STORE_DIR } = process.env;
    const config = await loadRepoSandcastleConfig({
      cwd,
      env: { SANDCASTLE_IMAGE, SANDCASTLE_PNPM_STORE_DIR, GH_TOKEN: "fixture-host-credential" },
    });
    const execute = createExecutor(root, config);
    // Use the invocation checkout so the probe exercises the SDK's dotenv merge.
    await writeFile(
      join(root, ".sandcastle", ".env"),
      `GH_TOKEN=fixture-dotenv-credential
GITHUB_TOKEN=fixture-dotenv-token
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0=core.hooksPath
GIT_CONFIG_VALUE_0=/tmp/iam-sandcastle-hooks
`,
    );
    const readOnlyProbe: AgentProvider = {
      ...agent,
      buildPrintCommand: () => ({
        command: `set -eu
if env | grep -Eq '^(GH_TOKEN=|GITHUB_TOKEN=|GIT_CONFIG_)'; then
  echo 'Writable environment variables reached the read-only sandbox' >&2
  exit 1
fi
test "$(git config --get core.hooksPath)" = .husky/_
test ! -e /tmp/iam-sandcastle-hooks/pre-commit
test ! -e /var/run/docker.sock
test -z "\${DOCKER_HOST:-}"
printf '%s\n' '${complete}'`,
      }),
    };
    const readOnlyResult = await execute(
      { phase: "plan", worktreePath: root, role: { provider: readOnlyProbe } },
      (options, runAgent) => runAgent({ ...options, prompt: "Run the read-only Docker smoke probe." }),
    );
    assert(completed(readOnlyResult), "The read-only container probe did not complete.");
    const result = await execute(
      { phase: "implement", worktreePath: worktree.worktreePath, role: { provider: agent } },
      (options, runAgent) => runAgent({ ...options, prompt: "Run the local Docker smoke probe." }),
    );
    assert(completed(result), "The container probe did not complete.");
    assert.equal(await git("show", "smoke:sandcastle-smoke.md"), "# Sandcastle smoke");
    const sandboxId = (await readFile(join(root, "test-results/integration/sandbox-id"), "utf8")).trim();
    assert.match(sandboxId, /^[a-f0-9]{64}$/);
    assert.equal(await command("docker", ["ps", "-aq", "--no-trunc", "--filter", `id=${sandboxId}`], root), "");
    assert.equal(
      await command("docker", ["network", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`], root),
      "",
    );
  } finally {
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    await worktree.close();
  }
  assert.equal((await git("worktree", "list", "--porcelain")).match(/^worktree /gm)?.length, 1);
  assert.equal(await readFile(configPath, "utf8"), hostConfig);
  await rm(root, { recursive: true });
  console.log("Sandcastle Docker smoke passed.");
}
