import { lstat, readdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createWorktree, type Worktree } from "@ai-hero/sandcastle";
import { command, hasCode } from "./command.ts";
import { validateRepository } from "./config.ts";

function repoFromUrl(remoteUrl: string): string {
  const url = /^[\w+.-]+:\/\//.test(remoteUrl) ? URL.parse(remoteUrl) : null;
  const scpPath = /^(?:[^@/:]+@)?(?:\[[^\]]+\]|[^/:]+):(.+)$/.exec(remoteUrl)?.[1];
  const path = url?.pathname ?? scpPath ?? remoteUrl;
  const segments = path.replace(/\/+$/, "").split("/").slice(-2);
  try {
    const [owner, name] = segments.map(decodeURIComponent);
    if (owner && name && !owner.includes("/") && !name.includes("/")) {
      return validateRepository(`${owner}/${name.replace(/\.git$/, "")}`);
    }
  } catch {
    // Do not include the original remote URL, which may embed credentials.
  }
  throw new Error("The remote URL does not identify owner/repo. Set repo explicitly.");
}

function assertNoEmbeddedCredentials(remoteUrls: readonly string[]) {
  for (const remoteUrl of remoteUrls) {
    const url = /^[\w+.-]+:\/\//.test(remoteUrl) ? URL.parse(remoteUrl) : null;
    if (!url) continue;
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    if (url.password || (isHttp && url.username)) {
      throw new Error("Git remote URL must not embed credentials in .git/config because sandboxes can read it.");
    }
  }
}

export async function resolveRepository(
  cwd: string,
  branch: string,
  options: { repo?: string; remote?: string } = {},
): Promise<{ repo: string; remote: string }> {
  const git = (...args: string[]) => command("git", args, cwd);
  const configuredUrls = await git("config", "--get-regexp", "^remote\\..*\\.url$").catch((error) => {
    if (!hasCode(error, 1)) throw error;
    return "";
  });
  assertNoEmbeddedCredentials(
    configuredUrls
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(line.indexOf(" ") + 1)),
  );
  const remotes = (await git("remote")).split("\n").filter(Boolean);
  const tracked = await git("config", "--get", `branch.${branch}.remote`).catch((error) => {
    if (!hasCode(error, 1)) throw error;
    return "";
  });
  const remote =
    options.remote ??
    (remotes.includes(tracked) ? tracked : undefined) ??
    (remotes.includes("origin") ? "origin" : undefined) ??
    (remotes.length === 1 ? remotes[0] : undefined);
  if (!remote || !remotes.includes(remote)) throw new Error("Select a configured Git remote for this repository.");
  const repo =
    options.repo !== undefined
      ? validateRepository(options.repo)
      : repoFromUrl(await git("remote", "get-url", "--", remote));
  return { repo, remote };
}

export function specBranchName(
  number: number,
  body: string,
  prefix = "sandcastle",
  keywords: readonly string[] = [],
): string {
  const headings = new Set(["integration-branch", ...keywords.map((keyword) => keyword.toLowerCase())]);
  const declared = new Set<string>();
  for (const [, heading, branch] of body.matchAll(/^([^:\r\n：]+)[:：][ \t]*`?([^\s`]+)`?[ \t]*$/gm)) {
    if (heading && branch && headings.has(heading.trim().toLowerCase())) declared.add(branch);
  }
  if (declared.size > 1) throw new Error(`Spec #${number} declares conflicting integration branches.`);
  return declared.values().next().value ?? `${prefix}/spec-${number}`;
}

export function ticketBranchName(number: number, prefix = "sandcastle"): string {
  return `${prefix}/issue-${number}`;
}

export type IntegrationEvidence = { candidate: string; mergeSha: string };
export type IntegrationResult =
  | ({ status: "merged" } & IntegrationEvidence)
  | { status: "conflict" | "no-change"; integrationSha: string };

type Checkout = Pick<Worktree, "worktreePath" | "branch">;

function serialQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
}

async function inspectPath(path: string) {
  return lstat(path).catch((error) => {
    if (!hasCode(error, "ENOENT")) throw error;
    return undefined;
  });
}

export function createGitWorkspace(cwd: string) {
  const git = (...args: string[]) => command("git", args, cwd);
  const serial = serialQueue();
  const at = (checkout: Checkout, ...args: string[]) => command("git", args, checkout.worktreePath);
  async function ancestor(older: string, newer: string) {
    try {
      await git("merge-base", "--is-ancestor", older, newer);
      return true;
    } catch (error) {
      if (!hasCode(error, 1)) throw error;
      return false;
    }
  }
  async function branchTips(branches: Iterable<string>) {
    const prefix = "refs/heads/";
    const refs = new Set([...branches].map((branch) => prefix + branch));
    const tips = new Map<string, string>();
    if (!refs.size) return tips;
    const output = await git("for-each-ref", "--format=%(refname) %(objectname)", ...refs);
    for (const line of output.split("\n")) {
      const [ref, sha] = line.split(" ");
      if (ref && sha && refs.has(ref)) tips.set(ref.slice(prefix.length), sha);
    }
    return tips;
  }
  async function branchTip(branch: string) {
    return (await branchTips([branch])).get(branch);
  }
  async function observe(checkout: Checkout, allowDirty = false) {
    if ((await at(checkout, "symbolic-ref", "HEAD")) !== `refs/heads/${checkout.branch}`) {
      throw new Error(`Unexpected branch at ${checkout.worktreePath}.`);
    }
    const directory = await at(checkout, "rev-parse", "--absolute-git-dir");
    for (const entry of [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "rebase-merge",
      "rebase-apply",
      "sequencer",
    ]) {
      if (await inspectPath(join(directory, entry)))
        throw new Error(`Unfinished Git operation at ${checkout.worktreePath}.`);
    }
    if (!allowDirty && (await at(checkout, "status", "--porcelain", "--untracked-files=all"))) {
      throw new Error(`Uncommitted changes at ${checkout.worktreePath}.`);
    }
    return at(checkout, "rev-parse", "HEAD");
  }
  async function assertBranch(branch: string) {
    await git("check-ref-format", `refs/heads/${branch}`);
    if (!branch || branch.startsWith("-")) throw new Error("Invalid local branch name.");
  }

  async function managedWorktrees() {
    const root = await realpath(cwd);
    const managed = join(root, ".sandcastle", "worktrees");
    for (const directory of [dirname(managed), managed]) {
      if ((await inspectPath(directory))?.isSymbolicLink()) {
        throw new Error(`Unexpected worktree directory link: ${directory}.`);
      }
    }
    return { root, managed };
  }

  async function listWorktrees() {
    return (await git("worktree", "list", "--porcelain", "-z"))
      .split("\0\0")
      .filter(Boolean)
      .map((entry) => {
        const [path, ...fields] = entry.split("\0");
        return {
          path: path?.slice("worktree ".length) ?? "",
          ref: fields.find((field) => field.startsWith("branch "))?.slice("branch ".length),
          unavailable: fields.some((field) => /^(?:locked|prunable)(?: |$)/.test(field)),
          prunable: fields.some((field) => /^prunable(?: |$)/.test(field)),
        };
      });
  }

  function managedCheckout(entries: Awaited<ReturnType<typeof listWorktrees>>, managed: string, branch: string) {
    const matches = entries.filter(({ ref }) => ref === `refs/heads/${branch}`);
    const checkout = matches[0];
    if (checkout && (matches.length !== 1 || dirname(checkout.path) !== managed || checkout.unavailable)) {
      throw new Error(
        `Branch ${branch} is checked out outside an available managed worktree. Preserve its registration.`,
      );
    }
    return checkout;
  }

  return {
    observe,
    ancestor,
    branchTip,
    branchTips,
    assertBranch,
    async synchronizeInvocation(branch: string, remote: string): Promise<string> {
      await assertBranch(branch);
      const invocation = { branch, worktreePath: cwd };
      const local = await observe(invocation);
      await git("fetch", "--no-tags", "--", remote, `refs/heads/${branch}`);
      const fetched = await git("rev-parse", "--verify", "FETCH_HEAD^{commit}");
      if ((await observe(invocation)) !== local || local !== fetched) {
        throw new Error(
          `Invocation branch ${branch} must match the fetched ${remote} branch. Synchronize it before running.`,
        );
      }
      return local;
    },
    open(branch: string, base: string, options: { allowDirty?: boolean } = {}): Promise<Worktree> {
      return serial(async () => {
        await assertBranch(branch);
        const { root, managed } = await managedWorktrees();
        const expected = join(managed, branch.replaceAll("/", "-"));
        const entries = await listWorktrees();
        const registration = managedCheckout(entries, managed, branch);
        const path = registration?.path;
        if (entries.some((entry) => entry.path === expected && entry !== registration)) {
          throw new Error(`Worktree path ${expected} is registered to a different checkout.`);
        }
        // The SDK prunes unregistered directories using line-delimited Git output.
        if (await inspectPath(managed)) {
          const registeredPaths = new Set(entries.map((entry) => entry.path));
          const stale = entries.find((entry) => dirname(entry.path) === managed && entry.prunable);
          if (stale) throw new Error(`Stale worktree registration requires inspection: ${stale.path}.`);
          for (const entry of await readdir(managed, { withFileTypes: true })) {
            const child = join(managed, entry.name);
            if (
              entry.isSymbolicLink() ||
              ((entry.isDirectory() || child === expected) &&
                (!registeredPaths.has(child) || child.includes("\n") || child !== child.trimEnd()))
            ) {
              throw new Error(
                `Unrecognized worktree path ${child}. Preserve it before creating or reusing a worktree.`,
              );
            }
          }
        }
        const previous = path
          ? await observe({ worktreePath: path, branch }, options.allowDirty)
          : await branchTip(branch);
        const baseSha = await git("rev-parse", "--verify", "--end-of-options", `${base}^{commit}`);
        const worktree = await createWorktree({
          cwd: root,
          branchStrategy: { type: "branch", branch, baseBranch: baseSha },
        });
        if (worktree.worktreePath !== (path ?? expected)) throw new Error(`Unexpected worktree path for ${branch}.`);
        const sha = await observe(worktree, options.allowDirty);
        if (previous ? !(await ancestor(previous, sha)) : sha !== baseSha) {
          throw new Error(`Unexpected worktree HEAD for ${branch}. Preserve the checkout for inspection.`);
        }
        return worktree;
      });
    },
    async close(worktree: Worktree, candidate: string): Promise<void> {
      await serial(async () => {
        if ((await observe(worktree)) !== candidate) throw new Error(`Worktree ${worktree.branch} has moved.`);
        const result = await worktree.close();
        if (result.preservedWorktreePath || (await inspectPath(worktree.worktreePath))) {
          throw new Error(`Worktree ${worktree.branch} could not be removed. Preserve its branch and checkout.`);
        }
      });
    },
    closeTicket(branch: string, candidate: string) {
      return serial(async () => {
        await assertBranch(branch);
        const tip = await branchTip(branch);
        if (!tip) return;
        if (!(await ancestor(tip, candidate))) throw new Error(`Ticket branch ${branch} has unmerged changes.`);
        const { managed } = await managedWorktrees();
        const registration = managedCheckout(await listWorktrees(), managed, branch);
        if (registration) {
          const path = registration.path;
          if ((await inspectPath(path))?.isSymbolicLink() || (await observe({ branch, worktreePath: path })) !== tip) {
            throw new Error(`Ticket worktree ${branch} changed before cleanup.`);
          }
          await git("worktree", "remove", "--", path);
          if (await inspectPath(path)) throw new Error(`Ticket worktree ${branch} could not be removed.`);
        } else {
          const path = join(managed, branch.replaceAll("/", "-"));
          if (await inspectPath(path)) throw new Error(`Unexpected unregistered worktree at ${path}.`);
        }
        await git("update-ref", "-d", `refs/heads/${branch}`, tip);
      });
    },
    integrate(spec: Checkout, ticket: Checkout, number: number, candidate: string): Promise<IntegrationResult> {
      return serial(async () => {
        if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Invalid ticket number.");
        const before = await observe(spec);
        if ((await observe(ticket)) !== candidate) throw new Error(`Candidate for ticket #${number} has moved.`);
        if (await ancestor(candidate, before)) return { status: "no-change", integrationSha: before };
        try {
          await at(
            spec,
            "merge",
            "--no-ff",
            "--no-edit",
            "--no-log",
            "--commit",
            "--no-autostash",
            "-m",
            `Integrate ticket #${number}`,
            "-m",
            `Sandcastle-Ticket: #${number}`,
            candidate,
          );
        } catch (error) {
          const directory = await at(spec, "rev-parse", "--absolute-git-dir");
          if (
            !(await inspectPath(join(directory, "MERGE_HEAD"))) ||
            (await at(spec, "rev-parse", "MERGE_HEAD")) !== candidate ||
            !(await at(spec, "ls-files", "--unmerged"))
          )
            throw error;
          await at(spec, "merge", "--abort");
          if ((await observe(spec)) !== before)
            throw new Error("Spec changed during conflict rollback.", { cause: error });
          return { status: "conflict", integrationSha: before };
        }
        const mergeSha = await observe(spec);
        const parents = await at(spec, "show", "-s", "--format=%P", mergeSha);
        const trailer = await at(
          spec,
          "show",
          "-s",
          "--format=%(trailers:key=Sandcastle-Ticket,valueonly,unfold)",
          mergeSha,
        );
        if (parents !== `${before} ${candidate}` || trailer !== `#${number}`) {
          throw new Error(`Git did not record a valid merge for ticket #${number}.`);
        }
        return { status: "merged", mergeSha, candidate };
      });
    },
    async inspectTickets(spec: Checkout | string, invocationBase: string, tickets: ReadonlyMap<number, string>) {
      const head = typeof spec === "string" ? spec : await observe(spec);
      const base = await git("rev-parse", "--verify", "--end-of-options", `${invocationBase}^{commit}`);
      if (!(await ancestor(base, head))) throw new Error("Spec does not include the invocation base.");
      const history = await git(
        "log",
        "--first-parent",
        "--merges",
        "-z",
        "--format=%H%n%P%n%(trailers:key=Sandcastle-Ticket,valueonly,unfold)",
        `${base}..${head}`,
      );
      const integrated = new Map<number, IntegrationEvidence>();
      const branchHeads = await branchTips(tickets.values());
      const tips = new Map<number, string>();
      for (const [number, branch] of tickets) {
        const tip = branchHeads.get(branch);
        if (tip) tips.set(number, tip);
      }
      for (const entry of history.split("\0")) {
        const [mergeSha, parents, trailer, ...extra] = entry.trimEnd().split("\n");
        const [first, candidate, ...otherParents] = parents?.split(" ") ?? [];
        const number = Number(/^#([1-9]\d*)$/.exec(trailer ?? "")?.[1]);
        if (
          extra.length ||
          otherParents.length ||
          !first ||
          !candidate ||
          !mergeSha ||
          !tickets.has(number) ||
          integrated.has(number)
        )
          continue;
        const tip = tips.get(number);
        if (tip && !(await ancestor(tip, candidate))) continue;
        // A zero-change merge cannot be created by the integration path.
        if (await ancestor(candidate, first)) continue;
        integrated.set(number, { mergeSha, candidate });
      }
      return { integrated, tips, resumable: new Set([...tips.keys()].filter((number) => !integrated.has(number))) };
    },
  };
}
