import type { Stats } from "node:fs";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";
import { shellQuote } from "./codex-provider.mts";
import { command } from "./commands.ts";

/** Existing process entries include a different hook path that the private gate must supersede. */
export const hookSmokeEnvironment = {
  GIT_CONFIG_COUNT: "5",
  GIT_CONFIG_KEY_0: "iam.smoke",
  GIT_CONFIG_VALUE_0: "retained process setting",
  GIT_CONFIG_KEY_1: "core.hooksPath",
  GIT_CONFIG_VALUE_1: "/tmp/iam-unused-smoke-hooks",
  GIT_CONFIG_KEY_2: "user.name",
  GIT_CONFIG_VALUE_2: "Sandcastle smoke",
  GIT_CONFIG_KEY_3: "user.email",
  GIT_CONFIG_VALUE_3: "sandcastle-smoke@example.invalid",
  GIT_CONFIG_KEY_4: "commit.gpgsign",
  GIT_CONFIG_VALUE_4: "false",
};

async function snapshotPath(path: string): Promise<unknown> {
  let metadata: Stats;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  if (metadata.isSymbolicLink()) return { link: await readlink(path), mode: metadata.mode };
  if (metadata.isDirectory()) {
    const entries = await readdir(path);
    return {
      mode: metadata.mode,
      entries: await Promise.all(entries.sort().map(async (name) => [name, await snapshotPath(join(path, name))])),
    };
  }
  return { mode: metadata.mode, contents: (await readFile(path)).toString("base64") };
}

/** Observe bytes and modes on the host, including absent generated Husky wrappers. */
export async function snapshotHostHooks(cwd: string, checkout: string): Promise<string> {
  const common = await command("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  const worktreeConfig = await command(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-path", "config.worktree"],
    checkout,
  );
  return JSON.stringify(
    await Promise.all(
      [join(common, "config"), worktreeConfig, join(cwd, ".husky", "_"), join(checkout, ".husky", "_")].map(
        snapshotPath,
      ),
    ),
  );
}

/** Called as the agent command, after the production preparation wrapper. */
export function hookCommitProbe(mode: "Implementer" | "Merger"): string {
  const path = `scripts/sandcastle-hook-${mode.toLowerCase()}-probe.ts`;
  const source = `export const hookProbe={mode:'${mode}'}\n`;
  const expected = `export const hookProbe = { mode: "${mode}" };`;
  const failure = "export const duplicate = 1;\nexport const duplicate = 2;\n";
  const log = `/tmp/iam-${mode.toLowerCase()}-hook-smoke.log`;
  return `
    set -eu
    test "$GIT_CONFIG_COUNT" = 6
    test "$GIT_CONFIG_KEY_0" = iam.smoke
    test "$GIT_CONFIG_VALUE_0" = 'retained process setting'
    test "$GIT_CONFIG_KEY_1" = core.hooksPath
    test "$GIT_CONFIG_VALUE_1" = /tmp/iam-unused-smoke-hooks
    test "$(git config --get iam.smoke)" = 'retained process setting'
    test "$(git config --get core.hooksPath)" = /tmp/iam-sandcastle-hooks
    test -x /tmp/iam-sandcastle-hooks/pre-commit
    test ! -e ${shellQuote(path)}
    printf '%s' ${shellQuote(source)} > ${shellQuote(path)}
    git add -- ${shellQuote(path)}
    if ! timeout --kill-after=5s 90s git commit -m ${shellQuote(`smoke: ${mode} hook success`)} </dev/null >${shellQuote(log)} 2>&1; then
      tail -c 16000 ${shellQuote(log)}
      exit 1
    fi
    test "$(git show HEAD:${path})" = ${shellQuote(expected)}
    test -z "$(git status --porcelain -- ${shellQuote(path)})"
    iam_smoke_head=$(git rev-parse HEAD)
    printf '%s' ${shellQuote(failure)} > ${shellQuote(path)}
    git add -- ${shellQuote(path)}
    if timeout --kill-after=5s 90s git commit -m ${shellQuote(`smoke: ${mode} hook must block`)} </dev/null >${shellQuote(log)} 2>&1; then
      echo '${mode} hook failed to block an invalid commit' >&2
      exit 1
    fi
    test "$(git rev-parse HEAD)" = "$iam_smoke_head"
    grep -q 'noRedeclare' ${shellQuote(log)}
    git restore --source=HEAD --staged --worktree -- ${shellQuote(path)}
    test -z "$(git status --porcelain)"
    printf '%s\\n' '${mode}: real commit formatting, lint failure and inherited Git configuration passed.'
  `;
}
