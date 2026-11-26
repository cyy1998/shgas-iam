import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { command, hasCode } from "./command.ts";
import type { BoundaryAssertionInput, IntegratedTicket, MergeTicketResult, SpecWorktree } from "./types.ts";

const shaPattern = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const unfinishedGitMarkers = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "rebase-merge",
  "rebase-apply",
  "sequencer",
] as const;

function assertSha(value: string, label = "Git SHA"): string {
  if (!shaPattern.test(value)) throw new Error(`Expected a full ${label}, got: ${value}`);
  return value;
}

async function inspectPath(path: string) {
  return lstat(path).catch((error) => {
    if (!hasCode(error, "ENOENT")) throw error;
    return undefined;
  });
}

async function resolveCommit(cwd: string, ref: string): Promise<string> {
  return command("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], cwd);
}

export async function observeCleanCheckout(worktreePath: string): Promise<string> {
  const gitDir = await command("git", ["rev-parse", "--absolute-git-dir"], worktreePath);
  for (const marker of unfinishedGitMarkers) {
    if (await inspectPath(join(gitDir, marker))) {
      throw new Error(`Refusing operation on dirty worktree with unfinished Git state (${marker}): ${worktreePath}.`);
    }
  }
  const status = await command("git", ["status", "--porcelain", "--untracked-files=all"], worktreePath);
  if (status) {
    throw new Error(`Refusing operation on dirty worktree with uncommitted changes: ${worktreePath}.`);
  }
  return command("git", ["rev-parse", "HEAD"], worktreePath);
}

async function listWorktrees(cwd: string) {
  const output = await command("git", ["worktree", "list", "--porcelain", "-z"], cwd);
  return output
    .split("\0\0")
    .filter(Boolean)
    .map((entry) => {
      const [pathField, ...fields] = entry.split("\0");
      return {
        path: pathField?.slice("worktree ".length) ?? "",
        ref: fields.find((field) => field.startsWith("branch "))?.slice("branch ".length),
        unavailable: fields.some((field) => /^(?:locked|prunable)(?: |$)/.test(field)),
      };
    });
}

export function createSerialQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
}

export function specBranchName(specNumber: number, body: string): string {
  const declared = new Set<string>();
  for (const [, heading, branch] of body.matchAll(/^([^:\r\n：]+)[:：][ \t]*`?([^\s`]+)`?[ \t]*$/gm)) {
    const normalized = heading?.trim().toLowerCase();
    if (branch && (normalized === "integration branch" || normalized === "集成分支")) {
      declared.add(branch);
    }
  }
  if (declared.size > 1) {
    throw new Error(`Spec #${specNumber} declares conflicting integration branches.`);
  }
  return declared.values().next().value ?? `sandcastle/spec-${specNumber}`;
}

export function ticketBranchName(ticketNumber: number): string {
  if (!Number.isSafeInteger(ticketNumber) || ticketNumber <= 0) {
    throw new Error(`Invalid ticket number: ${ticketNumber}`);
  }
  return `sandcastle/ticket-${ticketNumber}`;
}

export async function assertValidBranchName(cwd: string, branch: string): Promise<void> {
  if (!branch || branch.startsWith("-")) throw new Error(`Invalid Git branch name: ${branch}`);
  await command("git", ["check-ref-format", `refs/heads/${branch}`], cwd);
}

export async function isAncestor(cwd: string, older: string, newer: string): Promise<boolean> {
  const olderSha = await resolveCommit(cwd, older);
  const newerSha = await resolveCommit(cwd, newer);
  try {
    await command("git", ["merge-base", "--is-ancestor", olderSha, newerSha], cwd);
    return true;
  } catch (error) {
    if (!hasCode(error, 1)) throw error;
    return false;
  }
}

export async function branchTip(cwd: string, branch: string): Promise<string | undefined> {
  await assertValidBranchName(cwd, branch);
  const ref = `refs/heads/${branch}`;
  const output = await command("git", ["for-each-ref", "--format=%(objectname)", ref], cwd);
  return output || undefined;
}

export async function fetchBase(
  cwd: string,
  remote = "origin",
  baseBranch = "main",
): Promise<{ remoteRef: string; sha: string }> {
  await assertValidBranchName(cwd, baseBranch);
  if (!remote || remote.startsWith("-")) throw new Error(`Invalid Git remote name: ${remote}`);
  const remoteRef = `refs/remotes/${remote}/${baseBranch}`;
  await command("git", ["fetch", "--no-tags", "--", remote, `+refs/heads/${baseBranch}:${remoteRef}`], cwd);
  const sha = await resolveCommit(cwd, remoteRef);
  return { remoteRef, sha };
}

export async function mergeBase(cwd: string, specBranch: string, baseRef: string): Promise<string> {
  const specSha = await resolveCommit(cwd, specBranch);
  const baseSha = await resolveCommit(cwd, baseRef);
  return command("git", ["merge-base", specSha, baseSha], cwd);
}

function extractHandoff(commitBody: string, ticketNumber: number): string {
  const normalized = commitBody.replaceAll("\r\n", "\n").trim();
  const firstBreak = normalized.indexOf("\n\n");
  if (firstBreak === -1) return "";
  const rest = normalized.slice(firstBreak + 2).trim();
  const trailerLine = `Sandcastle-Ticket: #${ticketNumber}`;
  if (rest === trailerLine) return "";
  if (rest.endsWith(`\n\n${trailerLine}`)) return rest.slice(0, -(trailerLine.length + 2)).trim();
  if (rest.endsWith(`\n${trailerLine}`)) return rest.slice(0, -(trailerLine.length + 1)).trim();
  return rest;
}

export async function readIntegratedTickets(
  cwd: string,
  specBranch: string,
  mergeBaseSha: string,
): Promise<Map<number, IntegratedTicket>> {
  const base = assertSha(mergeBaseSha, "merge-base SHA");
  const head = await resolveCommit(cwd, specBranch);
  if (!(await isAncestor(cwd, base, head))) {
    throw new Error(`Spec branch ${specBranch} does not contain merge-base ${base}.`);
  }
  const history = await command(
    "git",
    [
      "log",
      "--first-parent",
      "--merges",
      "-z",
      "--format=%H%x1f%P%x1f%(trailers:key=Sandcastle-Ticket,valueonly,unfold)%x1f%B",
      `${base}..${head}`,
    ],
    cwd,
  );
  const integrated = new Map<number, IntegratedTicket>();
  for (const rawEntry of history.split("\0")) {
    if (!rawEntry) continue;
    const sep1 = rawEntry.indexOf("\x1f");
    const sep2 = sep1 === -1 ? -1 : rawEntry.indexOf("\x1f", sep1 + 1);
    const sep3 = sep2 === -1 ? -1 : rawEntry.indexOf("\x1f", sep2 + 1);
    if (sep1 === -1 || sep2 === -1 || sep3 === -1) continue;
    const mergeSha = rawEntry.slice(0, sep1).trim();
    const parents = rawEntry.slice(sep1 + 1, sep2).trim();
    const trailer = rawEntry.slice(sep2 + 1, sep3).trim();
    const body = rawEntry.slice(sep3 + 1);
    const parentList = parents.split(" ").filter(Boolean);
    if (parentList.length !== 2) continue;
    const [firstParent, candidateSha] = parentList;
    if (!firstParent || !candidateSha || !shaPattern.test(mergeSha)) continue;
    const match = /^#([1-9]\d*)$/.exec(trailer);
    if (!match) continue;
    const number = Number(match[1]);
    if (integrated.has(number)) continue;
    if (await isAncestor(cwd, candidateSha, firstParent)) continue;
    integrated.set(number, {
      number,
      mergeSha,
      candidateSha,
      handoff: extractHandoff(body, number),
    });
  }
  return integrated;
}

export async function mergeTicket(
  cwd: string,
  specWorktreePath: string,
  ticketNumber: number,
  ticketBranch: string,
  handoff: string,
): Promise<MergeTicketResult> {
  if (!Number.isSafeInteger(ticketNumber) || ticketNumber <= 0) {
    throw new Error(`Invalid ticket number: ${ticketNumber}`);
  }
  await assertValidBranchName(cwd, ticketBranch);
  const specTip = await observeCleanCheckout(specWorktreePath);
  const candidateSha = await resolveCommit(cwd, `refs/heads/${ticketBranch}`);
  if (await isAncestor(cwd, candidateSha, specTip)) {
    return { merged: false, conflict: false, specTip };
  }

  const trimmedHandoff = handoff.trim();
  const commitMessage = [
    `Integrate ticket #${ticketNumber}`,
    trimmedHandoff || undefined,
    `Sandcastle-Ticket: #${ticketNumber}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tempDir = await mkdtemp(join(tmpdir(), "sandcastle-merge-msg-"));
  const messagePath = join(tempDir, "message.txt");
  try {
    await writeFile(messagePath, `${commitMessage}\n`, { mode: 0o600, flag: "wx" });
    try {
      await command(
        "git",
        ["merge", "--no-ff", "--no-edit", "--no-log", "--commit", "--no-autostash", "-F", messagePath, candidateSha],
        specWorktreePath,
      );
    } catch (error) {
      const gitDir = await command("git", ["rev-parse", "--absolute-git-dir"], specWorktreePath);
      const hasMergeHead = Boolean(await inspectPath(join(gitDir, "MERGE_HEAD")));
      const unmerged = hasMergeHead
        ? await command("git", ["ls-files", "--unmerged"], specWorktreePath).catch(() => "")
        : "";
      if (!hasMergeHead || !unmerged) throw error;
      await command("git", ["merge", "--abort"], specWorktreePath);
      const afterAbort = await observeCleanCheckout(specWorktreePath);
      if (afterAbort !== specTip) {
        throw new Error(`Spec worktree HEAD changed during merge abort for ticket #${ticketNumber}.`, { cause: error });
      }
      return { merged: false, conflict: true, specTip };
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  const mergeSha = await observeCleanCheckout(specWorktreePath);
  const parents = await command("git", ["show", "-s", "--format=%P", mergeSha], specWorktreePath);
  const trailer = await command(
    "git",
    ["show", "-s", "--format=%(trailers:key=Sandcastle-Ticket,valueonly,unfold)", mergeSha],
    specWorktreePath,
  );
  if (parents !== `${specTip} ${candidateSha}` || trailer !== `#${ticketNumber}`) {
    throw new Error(`Git did not record a valid merge commit for ticket #${ticketNumber}.`);
  }
  return { merged: true, mergeSha, candidateSha };
}

export async function assertBoundary(cwd: string, input: BoundaryAssertionInput): Promise<void> {
  const { ticketBranch, baselineSha, specBranch, expectedSpecTip, remoteRef, expectedRemoteSha } = input;
  if ((ticketBranch === undefined) !== (baselineSha === undefined)) {
    throw new Error("assertBoundary requires both ticketBranch and baselineSha when validating a ticket candidate.");
  }

  if (ticketBranch !== undefined && baselineSha !== undefined) {
    await assertValidBranchName(cwd, ticketBranch);
    assertSha(baselineSha, "baseline SHA");
    const candidateSha = await branchTip(cwd, ticketBranch);
    if (!candidateSha) {
      throw new Error(`Trust boundary violation: ticket branch ${ticketBranch} is missing.`);
    }
    if (!(await isAncestor(cwd, baselineSha, candidateSha))) {
      throw new Error(
        `Trust boundary violation: ticket branch ${ticketBranch} (${candidateSha}) does not contain baseline ${baselineSha}.`,
      );
    }
  }

  const actualSpecTip = await branchTip(cwd, specBranch);
  if (actualSpecTip !== assertSha(expectedSpecTip, "expected Spec tip SHA")) {
    throw new Error(
      `Trust boundary violation: Spec branch ${specBranch} moved (expected ${expectedSpecTip}, got ${actualSpecTip ?? "missing"}).`,
    );
  }

  const actualRemoteSha = await resolveCommit(cwd, remoteRef).catch(() => undefined);
  if (actualRemoteSha !== assertSha(expectedRemoteSha, "expected remote SHA")) {
    throw new Error(
      `Trust boundary violation: remote ref ${remoteRef} moved (expected ${expectedRemoteSha}, got ${actualRemoteSha ?? "missing"}).`,
    );
  }
}

export async function findManagedWorktree(cwd: string, branch: string): Promise<string | undefined> {
  await assertValidBranchName(cwd, branch);
  const root = await realpath(cwd);
  const managedDir = join(root, ".sandcastle", "worktrees");
  const entries = await listWorktrees(root);
  const match = entries.find(
    (entry) => entry.ref === `refs/heads/${branch}` && dirname(entry.path) === managedDir && !entry.unavailable,
  );
  return match?.path;
}

export async function ensureSpecWorktree(cwd: string, specBranch: string, baseSha: string): Promise<SpecWorktree> {
  await assertValidBranchName(cwd, specBranch);
  const resolvedBase = await resolveCommit(cwd, baseSha);
  const root = await realpath(cwd);
  const managedDir = join(root, ".sandcastle", "worktrees");
  for (const dirPath of [dirname(managedDir), managedDir]) {
    if ((await inspectPath(dirPath))?.isSymbolicLink()) {
      throw new Error(`Unexpected symbolic link in managed worktree path: ${dirPath}.`);
    }
  }

  const entries = await listWorktrees(root);
  const matches = entries.filter((entry) => entry.ref === `refs/heads/${specBranch}`);
  const existing = matches[0];
  if (existing) {
    if (matches.length !== 1 || dirname(existing.path) !== managedDir || existing.unavailable) {
      throw new Error(`Branch ${specBranch} is checked out outside an available managed worktree (${existing.path}).`);
    }
    const head = await observeCleanCheckout(existing.path);
    return { worktreePath: existing.path, branch: specBranch, head };
  }

  const worktreePath = join(managedDir, specBranch.replaceAll("/", "-"));
  if (entries.some((entry) => entry.path === worktreePath)) {
    throw new Error(`Worktree path ${worktreePath} is already registered to a different branch.`);
  }
  await mkdir(managedDir, { recursive: true });
  const existingTip = await branchTip(root, specBranch);
  if (existingTip) {
    await command("git", ["worktree", "add", "--", worktreePath, specBranch], root);
  } else {
    await command("git", ["worktree", "add", "-b", specBranch, "--", worktreePath, resolvedBase], root);
  }
  const head = await observeCleanCheckout(worktreePath);
  return { worktreePath, branch: specBranch, head };
}

export async function removeWorktreeSafe(cwd: string, worktreePath: string): Promise<void> {
  const info = await inspectPath(worktreePath);
  if (!info) return;
  if (info.isSymbolicLink()) {
    throw new Error(`Refusing to remove symbolic link as worktree: ${worktreePath}.`);
  }
  await observeCleanCheckout(worktreePath);
  await command("git", ["worktree", "remove", "--", worktreePath], cwd);
  if (await inspectPath(worktreePath)) {
    throw new Error(`Worktree ${worktreePath} still exists after removal.`);
  }
}

export async function deleteBranchCas(cwd: string, branch: string, expectedTip: string): Promise<void> {
  await assertValidBranchName(cwd, branch);
  const tip = assertSha(expectedTip, "expected branch tip SHA");
  await command("git", ["update-ref", "-d", `refs/heads/${branch}`, tip], cwd);
}

export async function pushBranchNonForce(
  cwd: string,
  remote: string,
  branch: string,
  expectedHead: string,
): Promise<void> {
  await assertValidBranchName(cwd, branch);
  if (!remote || remote.startsWith("-")) throw new Error(`Invalid Git remote name: ${remote}`);
  const head = assertSha(expectedHead, "expected head SHA");
  const ref = `refs/heads/${branch}`;
  await command("git", ["push", "--no-follow-tags", "--", remote, `${head}:${ref}`], cwd);
  const remoteOutput = await command("git", ["ls-remote", "--heads", "--", remote, ref], cwd);
  const lines = remoteOutput.split("\n").filter(Boolean);
  const matched = lines.length === 1 && lines[0] === `${head}\t${ref}`;
  if (!matched) {
    throw new Error(`Could not verify remote branch ${remote}/${branch} matches ${head}.`);
  }
}
