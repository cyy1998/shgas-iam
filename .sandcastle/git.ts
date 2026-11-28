import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseEnv, promisify } from "node:util";

const exec = promisify(execFile);
const MAX_BUFFER = 16 * 1024 * 1024;
export const TRAILER_PREFIX = "Sandcastle-Ticket: #";

export type ExecFn = (file: string, args: string[], cwd: string) => Promise<string>;

export async function runCommand(file: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec(file, args, { cwd, maxBuffer: MAX_BUFFER });
  return stdout.trimEnd();
}

async function checkDotEnvFile(dir: string): Promise<void> {
  const envPath = join(dir, ".sandcastle", ".env");
  const raw = await readFile(envPath, "utf8").catch((err: unknown) => {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return undefined;
    throw err;
  });
  if (raw === undefined) return;
  const parsed = parseEnv(raw);
  const lineHit = raw.split(/\r?\n/).some((line) => /^\s*(?:export\s+)?(?:GH_TOKEN|GITHUB_TOKEN)\s*=/.test(line));
  if (lineHit || Object.hasOwn(parsed, "GH_TOKEN") || Object.hasOwn(parsed, "GITHUB_TOKEN")) {
    throw new Error(`拒绝启动：${envPath} 不得声明 GH_TOKEN 或 GITHUB_TOKEN（含空值）。`);
  }
}

export async function preflightCredentials(cwd: string, extraDirs: string[] = []): Promise<void> {
  const dirs = [...new Set([resolve(cwd), ...extraDirs.map((d) => resolve(d))])];
  for (const dir of dirs) await checkDotEnvFile(dir);

  const gitConfig = await readFile(join(cwd, ".git", "config"), "utf8").catch((err: unknown) => {
    if (err instanceof Error && "code" in err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return "";
    throw err;
  });
  if (/(?:https?:\/\/[^/\s@]+@)|(?:extraheader\s*=.*authorization)/i.test(gitConfig)) {
    throw new Error("拒绝启动：.git/config 包含内嵌凭据或 HTTP Authorization header。");
  }
}

export function parseGitHubRepoUrl(url: string): string | undefined {
  const trimmed = url.trim();
  const scp = /^git@github\.com:([^/\s]+\/[^/\s]+?)(?:\.git)?$/i.exec(trimmed);
  if (scp?.[1]) return scp[1].toLowerCase();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() !== "github.com") return undefined;
    if (parsed.protocol !== "https:" && parsed.protocol !== "ssh:") return undefined;
    const match = /^\/([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i.exec(parsed.pathname);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

export async function verifyGitRemote(
  cwd: string,
  remote: string,
  repo: string,
  execFn: ExecFn = runCommand,
): Promise<void> {
  const expected = repo.toLowerCase();
  for (const [label, args] of [
    ["push", ["remote", "get-url", "--push", "--all", remote]],
    ["fetch", ["remote", "get-url", "--all", remote]],
  ] as const) {
    const out = await execFn("git", [...args], cwd);
    const urls = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (urls.length === 0) throw new Error(`远端 ${remote} 未配置 ${label} URL。`);
    for (const url of urls) {
      if (parseGitHubRepoUrl(url) !== expected) {
        throw new Error(`远端 ${remote} 的 ${label} URL（${url}）与目标仓库 github.com/${repo} 不一致。`);
      }
    }
  }
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await runCommand("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], cwd);
    return true;
  } catch {
    return false;
  }
}

async function listWorktrees(cwd: string): Promise<{ path: string; branch?: string }[]> {
  const out = await runCommand("git", ["worktree", "list", "--porcelain"], cwd);
  const items: { path: string; branch?: string }[] = [];
  let current: { path: string; branch?: string } | undefined;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) items.push(current);
      current = { path: resolve(line.slice(9)) };
    } else if (line.startsWith("branch refs/heads/") && current) {
      current.branch = line.slice("branch refs/heads/".length);
    }
  }
  if (current) items.push(current);
  return items;
}

export async function assertClean(dir: string, label: string): Promise<void> {
  const status = await runCommand("git", ["status", "--porcelain"], dir);
  if (status.length > 0) throw new Error(`${label} 存在未提交改动：\n${status}`);
}

export async function ensureWorktree(cwd: string, dir: string, branch: string, startRef: string): Promise<string> {
  const target = resolve(dir);
  const active = (await listWorktrees(cwd)).find((w) => w.branch === branch);
  if (active) {
    if (active.path !== target) throw new Error(`分支 ${branch} 已被外部工作树占用：${active.path}`);
    await assertClean(target, `工作树 ${target}`);
    return target;
  }
  await mkdir(resolve(target, ".."), { recursive: true });
  if (await branchExists(cwd, branch)) {
    await runCommand("git", ["worktree", "add", target, branch], cwd);
  } else {
    await runCommand("git", ["worktree", "add", "-b", branch, target, startRef], cwd);
  }
  return target;
}

export async function removeWorktreeIfClean(cwd: string, dir: string): Promise<void> {
  const target = resolve(dir);
  const active = (await listWorktrees(cwd)).find((w) => w.path === target);
  if (!active) return;
  await assertClean(target, `清理工作树 ${target}`);
  await runCommand("git", ["worktree", "remove", target], cwd);
}

export async function deleteBranchCas(cwd: string, branch: string, expectedSha: string): Promise<void> {
  const active = (await listWorktrees(cwd)).find((w) => w.branch === branch);
  if (active) throw new Error(`分支 ${branch} 仍被工作树 ${active.path} 检出，拒绝删除。`);
  await runCommand("git", ["update-ref", "-d", `refs/heads/${branch}`, expectedSha], cwd);
}

export async function integratedTickets(
  cwd: string,
  mergeBase: string,
  specBranch: string,
): Promise<Map<number, string>> {
  const log = await runCommand(
    "git",
    ["log", "--first-parent", "--merges", "--format=%H%n%B%x00", `${mergeBase}..${specBranch}`],
    cwd,
  );
  const done = new Map<number, string>();
  for (const entry of log.split("\0")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const newline = trimmed.indexOf("\n");
    const sha = newline === -1 ? trimmed : trimmed.slice(0, newline);
    const msg = newline === -1 ? "" : trimmed.slice(newline + 1);
    for (const match of msg.matchAll(/^Sandcastle-Ticket:\s*#(\d+)\s*$/gm)) {
      if (match[1] && !done.has(Number(match[1]))) done.set(Number(match[1]), sha);
    }
  }
  return done;
}

export async function verifyMergeCommit(
  specWorktree: string,
  specTipBefore: string,
  ticketTip: string,
  ticketNumber: number,
): Promise<string> {
  const headSha = await runCommand("git", ["rev-parse", "HEAD"], specWorktree);
  if (headSha === specTipBefore) throw new Error(`合并 #${ticketNumber} 未产生新提交。`);
  try {
    await runCommand("git", ["merge-base", "--is-ancestor", specTipBefore, headSha], specWorktree);
  } catch {
    throw new Error(
      `#${ticketNumber} 合并后 HEAD（${headSha.slice(0, 8)}）未包含原 Spec 基线 ${specTipBefore.slice(0, 8)}。`,
    );
  }
  const merges = await runCommand(
    "git",
    ["rev-list", "--first-parent", "--merges", "--parents", `${specTipBefore}..${headSha}`],
    specWorktree,
  );
  const mergeSha = merges
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts.length >= 3 && parts.slice(1).includes(ticketTip))?.[0];
  if (!mergeSha) {
    throw new Error(
      `#${ticketNumber} 合并后在 ${specTipBefore.slice(0, 8)}..${headSha.slice(0, 8)} 的 --first-parent --merges 历史中未找到包含 ${ticketTip.slice(0, 8)} 的合并提交。`,
    );
  }
  const msg = await runCommand("git", ["log", "-1", "--pretty=%B", mergeSha], specWorktree);
  if (new RegExp(`^Sandcastle-Ticket:\\s*#${ticketNumber}\\s*$`, "m").test(msg)) return mergeSha;
  if (mergeSha !== headSha) {
    throw new Error(
      `#${ticketNumber} 的合并提交 ${mergeSha.slice(0, 8)} 缺少 ${TRAILER_PREFIX}${ticketNumber} trailer，且其后已有后续提交，无法自动补写。`,
    );
  }
  await runCommand(
    "git",
    ["commit", "--amend", "--no-verify", "-m", `${msg.trimEnd()}\n\n${TRAILER_PREFIX}${ticketNumber}`],
    specWorktree,
  );
  return runCommand("git", ["rev-parse", "HEAD"], specWorktree);
}
