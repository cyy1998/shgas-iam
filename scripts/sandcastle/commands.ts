import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function command(file: string, args: string[], cwd: string, timeout = 60_000): Promise<string> {
  try {
    const result = await exec(file, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    return result.stdout.trim();
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${file} 执行失败：${detail.slice(-6000)}`, { cause: error });
  }
}

export async function deleteMergedTicketBranch(cwd: string, branch: string, candidate: string): Promise<void> {
  if (!/^codex\/sandcastle\/issue-[1-9]\d*$/.test(branch))
    throw new Error(`不是 ticket 分支，保留 ${branch}。`);
  const tip = await command("git", ["rev-parse", `refs/heads/${branch}`], cwd);
  if (tip !== candidate)
    throw new Error(`ticket 分支 ${branch} 已偏离合入候选，保留分支。`);
  await command("git", ["merge-base", "--is-ancestor", tip, "HEAD"], cwd);
  await command("git", ["branch", "-d", "--", branch], cwd);
}
