import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCode, codex, run as nativeRun, type RunOptions, type RunResult } from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { command } from "../command.ts";
import type { SandcastleConfig } from "../config.ts";
import { runWorkflow } from "../workflow.ts";
import { commit } from "./git-fixture.ts";

const repo = "fixture/engine";
const complete = "<promise>COMPLETE</promise>";
const specBranch = "feat/fixture";
const ticketBranch = (number: number) => `sandcastle/issue-${number}`;
const repositoryUrl = `https://api.github.com/repos/${repo}`;
const actor = "fixture-bot";
const planner = { provider: claudeCode("planner"), instructions: "Planner role" };
const implementer = { provider: codex("implementer") };
const standards = { provider: claudeCode("standards") };
const specReviewer = { provider: codex("spec-reviewer") };
const repairer = { provider: codex("repairer") };
const researcher = { provider: claudeCode("researcher") };

function plan(numbers: number[], explore = false) {
  return {
    spec: 40,
    explore: { needed: explore, focus: "Map the module" },
    issues: numbers.map((number) => ({ number, implementer: "standard", reason: "Confirmed seam" })),
  };
}

type Pr = {
  number: number;
  url: string;
  state: string;
  headRefOid: string;
  headRefName: string;
  baseRefName: string;
  isCrossRepository: boolean;
};

async function withWorkflow(
  run: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
  numbers = [41],
) {
  const root = await mkdtemp(join(tmpdir(), "sandcastle-workflow-"));
  try {
    await run(await createFixture(root, numbers));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createFixture(root: string, numbers: number[]) {
  const cwd = join(root, "invocation");
  const remote = join(root, "remote.git");
  const git = (...args: string[]) => command("git", args, cwd);
  await command("git", ["init", "-b", "main", cwd], root);
  await command("git", ["init", "--bare", remote], root);
  await git("config", "user.name", "Workflow Fixture");
  await git("config", "user.email", "fixture@example.test");
  await git("remote", "add", "origin", remote);
  const base = await commit(cwd, "shared.txt", "startup");
  await git("push", "origin", "main");
  await writeFile(join(cwd, ".git", "info", "exclude"), "\n.sandcastle/\n");
  const labels = new Set([40, ...numbers]);
  const comments = new Map<number, string[]>();
  const assignees = new Map<number, string[]>();
  const closed = new Set<number>();
  const specs = new Map<number, { branch: string; numbers: number[]; heading?: string }>([
    [40, { branch: specBranch, numbers }],
  ]);
  const blockers = new Map<number, { number: number; state: string; repository_url?: string }[]>();
  const projects: number[] = [];
  const calls: RunOptions[] = [];
  const reports: string[] = [];
  let created = 0;
  let body = "";
  let pr: Pr | undefined;
  let beforeGitHub: (args: string[]) => Promise<void> = async () => {};
  let agent: ((options: RunOptions) => Promise<RunResult | undefined>) | undefined;
  const checkout = (branch: string) => join(cwd, ".sandcastle", "worktrees", branch.replaceAll("/", "-"));
  const remoteHead = async () => {
    const ref = await git("ls-remote", "--heads", "origin", `refs/heads/${specBranch}`);
    return ref.split(/\s+/)[0] || undefined;
  };
  function issue(number: number, state = closed.has(number) ? "closed" : "open", repository_url = repositoryUrl) {
    const spec = specs.get(number);
    return {
      number,
      state,
      repository_url,
      title: `Issue ${number}`,
      body: spec ? `${spec.heading ?? "Integration branch"}: ${spec.branch}` : "",
      labels: [
        { name: specs.has(number) ? "type:spec" : "type:ticket" },
        ...(labels.has(number) ? [{ name: "ready-for-agent" }] : []),
      ],
      assignees: (assignees.get(number) ?? []).map((login) => ({ login })),
    };
  }
  function connection<T>(nodes: T[]) {
    return { nodes, pageInfo: { hasNextPage: false, endCursor: null } };
  }
  function issueReference(snapshot: ReturnType<typeof issue>) {
    return {
      number: snapshot.number,
      state: snapshot.state.toUpperCase(),
      repository: { nameWithOwner: snapshot.repository_url.replace("https://api.github.com/repos/", "") },
    };
  }
  function graphIssue(number: number) {
    const snapshot = issue(number);
    return {
      ...issueReference(snapshot),
      title: snapshot.title,
      body: snapshot.body,
      labels: connection(snapshot.labels),
      assignees: connection(snapshot.assignees),
      blockedBy: connection(
        (blockers.get(number) ?? []).map((b) => issueReference(issue(b.number, b.state, b.repository_url))),
      ),
    };
  }
  const gh = async (args: string[]) => {
    await beforeGitHub(args);
    const [operation, action] = args;
    if (operation === "api") {
      if (action === "user") return JSON.stringify({ login: actor });
      if (action === "graphql") {
        const number = Number(args.find((arg) => arg.startsWith("number="))?.slice(7));
        if (args.some((arg) => arg.startsWith("query=") && arg.includes("query SpecGraph("))) {
          const parent = graphIssue(number);
          return JSON.stringify({
            data: {
              repository: {
                issue: {
                  ...parent,
                  subIssues: connection((specs.get(number)?.numbers ?? []).map((n) => ({ ...graphIssue(n), parent }))),
                },
              },
            },
          });
        }
        if (args.includes("fieldName=Delivery state")) {
          return JSON.stringify({
            data: {
              owner: {
                projectV2: {
                  id: "project",
                  closed: false,
                  viewerCanUpdate: true,
                  field: { id: "field", options: [{ id: "pr-open", name: "Pull request" }] },
                },
              },
            },
          });
        }
        if (args.includes(`number=${number}`)) {
          return JSON.stringify({ data: { repository: { issue: { id: String(number) } } } });
        }
        const content = args.find((arg) => arg.startsWith("content="))?.slice(8);
        if (content) return JSON.stringify({ data: { addProjectV2ItemById: { item: { id: content } } } });
        const item = args.find((arg) => arg.startsWith("item="))?.slice(5);
        if (item && args.includes("option=pr-open")) {
          projects.push(Number(item));
          return JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: item } } } });
        }
      }
      const path = action?.split("?")[0];
      if (path === `repos/${repo}/issues`) {
        return [...specs.keys()]
          .filter((id) => !closed.has(id))
          .map((id) => JSON.stringify(issue(id)))
          .join("\n");
      }
      const number = Number(path?.split("/")[4]);
      if (path?.endsWith("/comments")) {
        return (comments.get(number) ?? []).map((body) => JSON.stringify({ body, user: { login: actor } })).join("\n");
      }
      if (path === `repos/${repo}/issues/${number}`) return JSON.stringify(issue(number));
    }
    if (operation === "pr" && action === "list") return JSON.stringify(pr ? [pr] : []);
    if (operation === "pr" && action === "view" && pr) return JSON.stringify(pr);
    if (operation === "pr" && action === "create") {
      const head = await remoteHead();
      if (!head) throw new Error("The PR branch was not pushed");
      body = await readFile(args[args.indexOf("--body-file") + 1] ?? "", "utf8");
      created++;
      pr = {
        number: 99,
        url: "https://github.com/fixture/engine/pull/99",
        state: "OPEN",
        headRefOid: head,
        headRefName: specBranch,
        baseRefName: "main",
        isCrossRepository: false,
      };
      return pr.url;
    }
    if (operation === "issue" && action === "comment" && args.includes("--body-file")) {
      const number = Number(args[2]);
      const content = await readFile(args[args.indexOf("--body-file") + 1] ?? "", "utf8");
      comments.set(number, [...(comments.get(number) ?? []), content]);
      return `https://github.com/${repo}/issues/${number}`;
    }
    if (operation === "issue" && action === "edit" && args.slice(3).join(" ") === `--repo ${repo} --add-assignee @me`) {
      const number = Number(args[2]);
      assignees.set(number, [...new Set([...(assignees.get(number) ?? []), actor])]);
      return `https://github.com/${repo}/issues/${number}`;
    }
    if (operation === "issue" && action === "edit" && args.includes("--remove-label")) {
      labels.delete(Number(args[2]));
      return "";
    }
    throw new Error(`Unexpected GitHub call: ${JSON.stringify(args)}`);
  };

  const config: SandcastleConfig = {
    repo,
    sandbox: { image: "fixture", dockerfile: "Dockerfile" },
    roles: {
      planner,
      researcher,
      implementers: { standard: implementer },
      reviewers: { standards, spec: specReviewer },
      repairer,
      repairerDeep: repairer,
    },
  };
  return {
    cwd,
    base,
    git,
    remote,
    remoteHead,
    checkout,
    calls,
    reports,
    labels,
    comments,
    assignees,
    closed,
    specs,
    blockers,
    projects,
    config,
    get created() {
      return created;
    },
    get body() {
      return body;
    },
    set agent(value: typeof agent) {
      agent = value;
    },
    set beforeGitHub(value: typeof beforeGitHub) {
      beforeGitHub = value;
    },
    execute: (options: { maxSpecs?: number; maxParallel?: number } = {}) =>
      runWorkflow(
        {
          cwd,
          config,
          ...options,
          report(message) {
            reports.push(message);
          },
        },
        {
          gh,
          async run(options: RunOptions) {
            calls.push(options);
            const override = await agent?.(options);
            if (override) return override;
            if (options.agent === planner.provider) return response("", plan(numbers));
            if (options.agent === implementer.provider) {
              const path = requiredCwd(options);
              await commit(path, `${path.split("/").at(-1)}.txt`, "ticket implemented");
            }
            if (options.agent === repairer.provider) {
              return response(`Checks passed.\n<pr-body>Custom release summary</pr-body>\n${complete}`);
            }
            return response(`Report by ${options.name}\n${complete}`);
          },
        },
      ),
  };
}

function requiredCwd(options: RunOptions): string {
  if (!options.cwd) throw new Error("An executor must have a working directory");
  return options.cwd;
}

function response(stdout: string, output?: unknown) {
  return {
    stdout,
    output,
    branch: "",
    commits: [],
    iterations: [{ sessionId: "fixture-session" }],
    completionSignal: stdout.includes(complete) ? complete : undefined,
  };
}

test("the host claims a ticket before starting its implementation session", async () => {
  await withWorkflow(async (fixture) => {
    let assigneesAtDispatch: string[] | undefined;
    let implementationPrompt: string | undefined;
    fixture.agent = async ({ name, prompt }) => {
      if (name !== "implement") return;
      assigneesAtDispatch = fixture.assignees.get(41);
      implementationPrompt = prompt;
    };
    const result = await fixture.execute();
    expect(assigneesAtDispatch).toEqual([actor]);
    expect(implementationPrompt).not.toContain("--add-assignee");
    expect(result.delivered).toEqual([40]);
    expect(fixture.assignees.has(40)).toBe(false);
  });
});

test("a failed host claim pauses the ticket before an implementation session starts", async () => {
  await withWorkflow(async (fixture) => {
    fixture.beforeGitHub = async (args) => {
      if (args.includes("--add-assignee")) throw new Error("GitHub refused the assignment");
    };
    const result = await fixture.execute();
    expect(result.failed).toEqual([41]);
    expect(fixture.calls.map(({ name }) => name)).toEqual(["plan"]);
    expect(fixture.assignees.has(41)).toBe(false);
    expect(fixture.reports.join("\n")).toContain("GitHub refused the assignment");
    const retained = await fixture.git("rev-parse", ticketBranch(41));
    expect(retained).toBe(fixture.base);
  });
});

test("failed final verification cannot trigger a format-only PR body request", async () => {
  await withWorkflow(async (fixture) => {
    fixture.agent = async (options) => {
      if (options.agent !== repairer.provider) return;
      return response("Verification timed out.\n<pr-body>Premature draft</pr-body>");
    };
    const result = await fixture.execute();
    expect(result.incompleteSpecs).toEqual([40]);
    expect(fixture.calls.filter(({ agent }) => agent === repairer.provider)).toHaveLength(1);
    expect(fixture.created).toBe(0);
    expect(fixture.labels.has(40)).toBe(true);
    const remote = await fixture.remoteHead();
    expect(remote).toBeUndefined();
  });
});

test("completed repair publishes the draft from standard agent stdout", async () => {
  await withWorkflow(async (fixture) => {
    const result = await fixture.execute();
    expect(result.delivered).toEqual([40]);
    expect(fixture.body).toStartWith("Custom release summary");
    const repairs = fixture.calls.filter(({ name }) => name === "repair-and-verify");
    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.output).toBeUndefined();
  });
});

test("a high-risk plan uses the regular repairer when no override is configured", async () => {
  await withWorkflow(async (fixture) => {
    delete fixture.config.roles.repairerDeep;
    fixture.agent = async (options) => {
      if (options.name === "plan") return response("", { ...plan([41]), repairDeep: true });
    };
    const result = await fixture.execute();
    expect(result.delivered).toEqual([40]);
    expect(fixture.calls.find(({ name }) => name === "repair-and-verify")?.agent).toBe(repairer.provider);
  });
});

test("plans once, explores, dispatches independently ready tickets and reviews the same final merge in parallel", async () => {
  await withWorkflow(
    async (fixture) => {
      const implementations = Promise.withResolvers<void>();
      const reviews = Promise.withResolvers<void>();
      const started = new Set<number>();
      const reviewed: string[] = [];
      fixture.specs.set(40, { branch: specBranch, numbers: [41, 42, 43], heading: "Candidate branch" });
      await fixture.git("config", "merge.log", "true");
      fixture.blockers.set(41, [
        { number: 400, state: "closed", repository_url: "https://api.github.com/repos/external/core" },
      ]);
      fixture.blockers.set(43, [{ number: 41, state: "open" }]);
      fixture.config.promptExtras = {
        plan: "Select the lightest adequate role.",
        "review-standards": { replace: "Apply the local project standards." },
      };
      fixture.config.workflow = {
        branchDeclarationKeywords: ["Candidate branch"],
        project: {
          url: "https://github.com/orgs/fixture/projects/1",
          fieldName: "Delivery state",
          stageMap: { "PR Open": "Pull request" },
        },
      };
      fixture.agent = async (options) => {
        if (options.agent === planner.provider) return response("", plan([41, 42, 43], true));
        if (options.agent === implementer.provider) {
          const cwd = requiredCwd(options);
          const number = Number(cwd.split("-").at(-1));
          started.add(number);
          if (number === 43) {
            const history = await command("git", ["log", "--first-parent", "--format=%B"], cwd);
            expect(history).toContain("Sandcastle-Ticket: #41");
          } else {
            if (started.has(41) && started.has(42)) implementations.resolve();
            await implementations.promise;
          }
          expect(options.prompt).toContain("Report by explore");
        }
        if (options.agent === standards.provider || options.agent === specReviewer.provider) {
          expect(options.name === "review-standards" ? options.prompt : undefined).toEqual(
            options.agent === standards.provider
              ? expect.stringContaining("Apply the local project standards.")
              : undefined,
          );
          reviewed.push(await command("git", ["rev-parse", "HEAD"], requiredCwd(options)));
          if (reviewed.length === 2) reviews.resolve();
          await reviews.promise;
        }
        return undefined;
      };

      const result = await fixture.execute({ maxParallel: 2 });
      expect(result.delivered).toEqual([40]);
      expect(result.integrated.toSorted()).toEqual([41, 42, 43]);
      expect(fixture.calls.filter(({ name }) => name === "plan")).toHaveLength(1);
      expect(fixture.calls[0]?.prompt).toStartWith("Planner role");
      expect(fixture.calls[0]?.prompt).toContain("Select the lightest adequate role.");
      for (const { prompt } of fixture.calls) {
        expect(prompt).not.toContain("AGENTS.md");
        expect(prompt).not.toContain(".agents/skills/");
      }
      const remote = await fixture.remoteHead();
      if (!remote) throw new Error("Expected a published branch");
      expect(reviewed).toEqual([remote, remote]);
      const merges = await fixture.git("log", "--first-parent", "--merges", "-z", "--format=%B", `main..${specBranch}`);
      expect(
        merges
          .split("\0")
          .filter(Boolean)
          .map((message) => message.trim())
          .toSorted(),
      ).toEqual([
        "Integrate ticket #41\n\nSandcastle-Ticket: #41",
        "Integrate ticket #42\n\nSandcastle-Ticket: #42",
        "Integrate ticket #43\n\nSandcastle-Ticket: #43",
      ]);
      const local = await fixture.git("rev-parse", specBranch);
      expect(local).toBe(remote);
      const invocation = await fixture.git("rev-parse", "HEAD");
      expect(invocation).toBe(fixture.base);
      const worktrees = await fixture.git("worktree", "list", "--porcelain");
      expect(worktrees).not.toContain("/worktrees/");
      const refs = await fixture.git("branch", "--list", "sandcastle/*");
      expect(refs).toBe("");
      expect(fixture.labels.size).toBe(0);
      expect(fixture.projects).toEqual([40, 41, 42, 43]);
      expect(fixture.created).toBe(1);
      expect(fixture.body).toStartWith("Custom release summary");
      expect(fixture.body).toContain("Closes #40\nCloses #41\nCloses #42\nCloses #43");
      expect(fixture.body).toContain("## Integrated Tickets");
      expect(fixture.comments.get(41)?.[0]).toContain("Report by implement");
      expect(fixture.body).toContain("Report by review-standards");
      expect(fixture.body).toContain("Report by review-spec");
    },
    [41, 42, 43],
  );
});

test("resolves a genuine conflict once after abort and integrates both sibling candidates", async () => {
  await withWorkflow(
    async (fixture) => {
      const gate = Promise.withResolvers<void>();
      let started = 0;
      let resolutions = 0;
      fixture.agent = async (options) => {
        if (options.name === "implement") {
          const cwd = requiredCwd(options);
          started++;
          if (started === 2) gate.resolve();
          await gate.promise;
          await commit(cwd, "shared.txt", cwd.endsWith("-41") ? "first implementation" : "second implementation");
          return response(`Focused verification passed.\n${complete}`);
        }
        if (options.name === "resolve-conflict") {
          resolutions++;
          const worktree = fixture.checkout(specBranch);
          const status = await command("git", ["status", "--porcelain"], worktree);
          expect(status).toBe("");
          const integration = await fixture.git("rev-parse", specBranch);
          expect(options.prompt).toContain(integration);
          const cwd = requiredCwd(options);
          const error = await command("git", ["merge", "--no-ff", integration], cwd).catch((reason: unknown) => reason);
          expect(error).toBeInstanceOf(Error);
          await writeFile(join(cwd, "shared.txt"), "combined behavior");
          await command("git", ["add", "shared.txt"], cwd);
          await command("git", ["-c", "core.hooksPath=/dev/null", "commit", "--no-edit"], cwd);
          return response(`Focused verification passed.\n${complete}`);
        }
      };
      const result = await fixture.execute({ maxParallel: 2 });
      expect(result.delivered).toEqual([40]);
      expect(resolutions).toBe(1);
      const content = await fixture.git("show", `${specBranch}:shared.txt`);
      expect(content).toBe("combined behavior");
    },
    [41, 42],
  );
});

test("a zero-commit failure pauses delivery and restart resumes the same dirty checkout", async () => {
  await withWorkflow(async (fixture) => {
    const path = fixture.checkout(ticketBranch(41));
    fixture.agent = async (options) => {
      if (options.name === "plan") return response("", plan([41], true));
      if (options.name !== "implement") return;
      await writeFile(join(requiredCwd(options), "unfinished.txt"), "preserve this");
      return response("Interrupted before the first commit");
    };
    const first = await fixture.execute();
    expect(first.failed).toEqual([41]);
    expect(first.incompleteSpecs).toEqual([40]);
    expect(fixture.calls.some(({ name }) => name === "repair-and-verify")).toBe(false);
    const head = await fixture.git("rev-parse", ticketBranch(41));
    expect(head).toBe(fixture.base);
    expect(fixture.created).toBe(0);

    fixture.agent = async (options) => {
      if (options.name === "plan") return response("", plan([41], true));
      if (options.name !== "implement") return;
      expect(requiredCwd(options)).toBe(path);
      expect(options.prompt).toContain("Report by explore");
      expect(options.prompt).toContain('"resuming": true');
      const content = await readFile(join(path, "unfinished.txt"), "utf8");
      expect(content).toBe("preserve this");
      await commit(path, "unfinished.txt", content);
      return response(`Focused verification passed.\n${complete}`);
    };
    const restarted = await fixture.execute();
    expect(restarted.delivered).toEqual([40]);
    expect(fixture.calls.filter(({ name }) => name === "explore")).toHaveLength(1);
    expect(fixture.created).toBe(1);
    const content = await fixture.git("show", `${specBranch}:unfinished.txt`);
    expect(content).toBe("preserve this");
  });
});

test("publishing verifies one candidate, reads the created PR by identity and skips blocker lookups during handoff", async () => {
  await withWorkflow(async (fixture) => {
    const trace = join(fixture.cwd, ".git", "delivery.trace");
    const traceVariable = "GIT_TRACE2_EVENT";
    const originalTrace = process.env[traceVariable];
    const afterCreate: string[][] = [];
    let repaired = false;
    let tracing = false;
    fixture.agent = async ({ name }) => {
      if (name === "repair-and-verify") repaired = true;
      return undefined;
    };
    fixture.beforeGitHub = async (args) => {
      if (repaired && !tracing && args[1] === `repos/${repo}/issues/40`) {
        tracing = true;
        process.env[traceVariable] = trace;
      }
      if (fixture.created) afterCreate.push(args);
    };
    let result: Awaited<ReturnType<typeof fixture.execute>>;
    try {
      result = await fixture.execute();
    } finally {
      if (originalTrace === undefined) delete process.env[traceVariable];
      else process.env[traceVariable] = originalTrace;
    }
    expect(result.delivered).toEqual([40]);
    expect(afterCreate.filter(([section]) => section === "pr").map((args) => args.slice(0, 3))).toEqual([
      ["pr", "view", "99"],
    ]);
    expect(afterCreate.some(([, endpoint]) => endpoint?.includes("/dependencies/"))).toBe(false);
    expect(fixture.labels.size).toBe(0);

    const traceContents = await readFile(trace, "utf8");
    const commands: string[][] = traceContents
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter(({ event }) => event === "start")
      .map(({ argv }) => argv);
    expect(commands.filter((argv) => argv.includes("--first-parent") && argv.includes("--merges"))).toHaveLength(1);
    // Count both delivery checks and the test double's lookup of the remote SHA for the created PR.
    expect(commands.filter((argv) => argv.includes("ls-remote"))).toHaveLength(3);
    const upstream = await fixture.git("rev-parse", "--symbolic-full-name", `${specBranch}@{upstream}`);
    expect(upstream).toBe(`refs/remotes/origin/${specBranch}`);
  });
});

test("a ticket advancing during handoff pauses cleanup before removing any worktree", async () => {
  await withWorkflow(
    async (fixture) => {
      fixture.beforeGitHub = async ([section, action, number]) => {
        if (section === "issue" && action === "edit" && number === "42") {
          await commit(fixture.checkout(ticketBranch(41)), "late.txt", "work after verification");
        }
      };
      const result = await fixture.execute();
      expect(result.incompleteSpecs).toEqual([40]);
      const trees = await fixture.git("worktree", "list", "--porcelain");
      expect(trees).toContain(fixture.checkout(ticketBranch(41)));
      expect(trees).toContain(fixture.checkout(ticketBranch(42)));
      expect(trees).toContain(fixture.checkout(specBranch));
    },
    [41, 42],
  );
});

test("planning the remaining tickets resumes at the partial integration tip", async () => {
  await withWorkflow(
    async (fixture) => {
      fixture.blockers.set(42, [{ number: 41, state: "open" }]);
      fixture.agent = async (options) => {
        if (options.name === "implement" && requiredCwd(options).endsWith("-42")) {
          return response("Second ticket interrupted");
        }
      };
      const first = await fixture.execute();
      expect(first.integrated).toEqual([41]);
      expect(first.failed).toEqual([42]);
      const tip = await fixture.git("rev-parse", specBranch);
      expect(tip).not.toBe(fixture.base);
      const message = await fixture.git("show", "-s", "--format=%B", tip);
      expect(message).toBe("Integrate ticket #41\n\nSandcastle-Ticket: #41");
      fixture.comments.clear();

      fixture.specs.set(50, { branch: "feat/fresh", numbers: [51] });
      fixture.labels.add(50);
      fixture.labels.add(51);
      fixture.calls.length = 0;
      fixture.agent = async (options) => {
        if (options.name !== "plan") return;
        const checkout = requiredCwd(options);
        const head = await command("git", ["rev-parse", "HEAD"], checkout);
        expect(head).toBe(tip);
        const integrated = await readFile(join(checkout, "sandcastle-issue-41.txt"), "utf8");
        expect(integrated).toBe("ticket implemented");
        expect(options.prompt).toContain(`"baseline": "${tip}"`);
        expect(options.prompt).not.toContain('"title": "Issue 50"');
        return response("", plan([42]));
      };
      const second = await fixture.execute();
      expect(second.integrated).toEqual([42]);
      expect(second.delivered).toEqual([40]);
      expect(fixture.calls.filter(({ name }) => name === "plan")).toHaveLength(1);
      expect(await fixture.git("rev-parse", "main")).toBe(fixture.base);
    },
    [41, 42],
  );
});

test("fresh planning remains available when the planner declines a partial integration", async () => {
  await withWorkflow(
    async (fixture) => {
      fixture.blockers.set(42, [{ number: 41, state: "open" }]);
      fixture.agent = async (options) => {
        if (options.name === "implement" && requiredCwd(options).endsWith("-42")) {
          return response("Second ticket interrupted");
        }
      };
      const first = await fixture.execute();
      expect(first.integrated).toEqual([41]);
      fixture.specs.set(50, { branch: "feat/fresh", numbers: [51] });
      fixture.labels.add(50);
      fixture.labels.add(51);
      fixture.calls.length = 0;
      fixture.agent = async ({ name }) => {
        if (name === "plan") return response("", { ...plan([]), spec: null });
      };

      const second = await fixture.execute();
      expect(second.exhausted).toBe(true);
      const planning = fixture.calls.filter(({ name }) => name === "plan");
      expect(planning.map(({ cwd }) => cwd)).toEqual([fixture.checkout(specBranch), fixture.cwd]);
      expect(planning[1]?.prompt).toContain('"title": "Issue 50"');
      expect(planning[1]?.prompt).not.toContain('"title": "Issue 40"');
    },
    [41, 42],
  );
});

test("an interrupted PR creation resumes from the exact verified SHA", async () => {
  await withWorkflow(async (fixture) => {
    let attempts = 0;
    fixture.beforeGitHub = async ([section, action]) => {
      if (section === "pr" && action === "create") {
        attempts++;
        throw new Error("Post https://api.github.com/graphql: EOF");
      }
    };
    const first = await fixture.execute();
    expect(first.incompleteSpecs).toEqual([40]);
    expect(attempts).toBe(1);
    const pushed = await fixture.remoteHead();
    expect(pushed).toBe(await fixture.git("rev-parse", specBranch));
    expect(fixture.created).toBe(0);
    fixture.calls.length = 0;
    fixture.beforeGitHub = async () => {};
    const restarted = await fixture.execute();
    expect(restarted.delivered).toEqual([40]);
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.created).toBe(1);
  });
});

test.each([false, true])("a repair failure resumes with review candidate drift = %p", async (advance) => {
  await withWorkflow(async (fixture) => {
    fixture.agent = async ({ name }) => {
      if (name === "repair-and-verify") {
        if (advance) await commit(fixture.checkout(specBranch), "new.txt", "repair advanced HEAD");
        throw new Error("Verification timed out");
      }
    };
    const first = await fixture.execute();
    expect(first.incompleteSpecs).toEqual([40]);
    expect(fixture.created).toBe(0);
    const candidate = await fixture.git("rev-parse", specBranch);
    fixture.calls.length = 0;
    fixture.agent = undefined;

    const second = await fixture.execute();
    expect(second.delivered).toEqual([40]);
    const calls = fixture.calls.map(({ name }) => name);
    if (advance) {
      expect(calls).toHaveLength(3);
      expect(calls.slice(0, 2).sort()).toEqual(["review-spec", "review-standards"]);
      expect(calls[2]).toBe("repair-and-verify");
    } else {
      expect(calls).toEqual(["repair-and-verify"]);
    }
    const repair = fixture.calls.find(({ name }) => name === "repair-and-verify");
    expect(repair?.prompt).toContain(`"reviewCandidate": "${candidate}"`);
    expect(repair?.prompt).toContain("Report by review-standards");
    expect(repair?.prompt).toContain("Report by review-spec");
  });
});

test("an interruption after label removal reuses the matching Open PR and only finishes pending handoffs", async () => {
  await withWorkflow(async (fixture) => {
    fixture.beforeGitHub = async ([section, action, number, ...flags]) => {
      if (section === "issue" && action === "edit" && number === "41" && flags.includes("--remove-label")) {
        throw new Error("network unavailable");
      }
    };
    const first = await fixture.execute();
    expect(first.incompleteSpecs).toEqual([40]);
    expect(fixture.created).toBe(1);
    expect(fixture.labels.has(40)).toBe(false);
    expect(fixture.labels.has(41)).toBe(true);
    fixture.calls.length = 0;
    fixture.beforeGitHub = async () => {};
    const second = await fixture.execute();
    expect(second.delivered).toEqual([40]);
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.created).toBe(1);
    expect(fixture.comments.get(41)?.filter((body) => body.startsWith("Spec #40 is ready"))).toHaveLength(1);
    expect(fixture.comments.get(40)?.filter((body) => body.startsWith("Spec #40 is ready"))).toHaveLength(1);
    const trees = await fixture.git("worktree", "list", "--porcelain");
    expect(trees).not.toContain("/worktrees/");
  });
});

test("HEAD drift invalidates finalization evidence and forces a new review and verification", async () => {
  await withWorkflow(async (fixture) => {
    fixture.beforeGitHub = async ([section, action]) => {
      if (section === "pr" && action === "create") throw new Error("network unavailable");
    };
    const first = await fixture.execute();
    expect(first.incompleteSpecs).toEqual([40]);
    const changed = await commit(fixture.checkout(specBranch), "new.txt", "new candidate");
    fixture.calls.length = 0;
    fixture.beforeGitHub = async () => {};
    const second = await fixture.execute();
    expect(second.delivered).toEqual([40]);
    const calls = fixture.calls.map(({ name }) => name);
    expect(calls).toHaveLength(3);
    expect(calls.slice(0, 2).sort()).toEqual(["review-spec", "review-standards"]);
    expect(calls[2]).toBe("repair-and-verify");
    expect(fixture.body).toContain(`Review-Candidate: ${changed}`);
    const pushed = await fixture.remoteHead();
    expect(pushed).toBe(changed);
  });
});

test("a rejected push retains verified delivery material and retries without starting agent sessions", async () => {
  await withWorkflow(async (fixture) => {
    // A ref lock reproduces a failed update without depending on access to GitHub or the network.
    const lock = join(fixture.remote, "refs", "heads", "feat", "fixture.lock");
    await mkdir(join(lock, ".."), { recursive: true });
    await writeFile(lock, "simulated receiver failure");
    const first = await fixture.execute();
    expect(first.incompleteSpecs).toEqual([40]);
    expect(fixture.created).toBe(0);
    const pushed = await fixture.remoteHead();
    expect(pushed).toBeUndefined();
    await rm(lock);
    fixture.calls.length = 0;
    const second = await fixture.execute();
    expect(second.delivered).toEqual([40]);
    expect(fixture.calls).toHaveLength(0);
  });
});

function scriptedProvider(script: (turn: { prompt: string; resumeSession?: string }) => string) {
  const provider = claudeCode("native-fixture");
  return {
    ...provider,
    sessionStorage: {
      ...provider.sessionStorage,
      async captureToHost() {},
      async resumeIntoSandbox() {},
      async existsOnHost() {
        return true;
      },
      async findByIdOnHost() {
        return { path: "/fixture-session", searchedRoot: "/fixture" };
      },
    },
    buildPrintCommand: (turn: { prompt: string; resumeSession?: string }) => ({
      command: "cat",
      stdin: `${JSON.stringify({ result: script(turn) })}\n`,
    }),
    parseStreamLine(line: string): ReturnType<typeof provider.parseStreamLine> {
      if (!line.startsWith('{"result":')) return [];
      return [
        { type: "session_id", sessionId: "native-session" },
        { type: "result", result: JSON.parse(line).result },
      ];
    },
  };
}

test("native plan output resumes on invalid JSON with a separate format retry budget", async () => {
  await withWorkflow(async (fixture) => {
    const prompts: string[] = [];
    const sessions: (string | undefined)[] = [];
    const scripted = scriptedProvider((turn) => {
      prompts.push(turn.prompt);
      sessions.push(turn.resumeSession);
      return (
        [
          "Preliminary evidence",
          "<plan>{bad JSON</plan>",
          "<plan>{not corrected}</plan>",
          `<plan>${JSON.stringify(plan([41], true))}</plan>`,
        ][prompts.length - 1] ?? ""
      );
    });
    fixture.config.workflow = {
      explore: false,
      review: false,
      projects: false,
      maxIterations: { plan: 2, implement: 3 },
      project: { url: "this URL would fail Projects preflight if enabled" },
    };
    fixture.config.roles.planner = { provider: scripted };
    fixture.agent = async (options) => {
      if (options.agent === scripted)
        return nativeRun({
          ...options,
          sandbox: noSandbox({ env: { GIT_CONFIG_GLOBAL: join(fixture.cwd, ".sandcastle", "sandbox.gitconfig") } }),
        });
    };
    const result = await fixture.execute();
    expect(result.delivered).toEqual([40]);
    expect(sessions).toEqual([undefined, "native-session", "native-session", "native-session"]);
    expect(prompts[2]).toContain("contains invalid JSON");
    expect(prompts[3]).toContain("contains invalid JSON");
    expect(fixture.calls.map(({ name }) => name)).toEqual(["plan", "plan", "implement", "repair-and-verify"]);
    expect(fixture.calls.find(({ name }) => name === "implement")?.maxIterations).toBe(3);
  });
});

test("native repair continues configured verification turns and requests a missing draft only after success", async () => {
  await withWorkflow(async (fixture) => {
    const prompts: string[] = [];
    const sessions: (string | undefined)[] = [];
    const scripted = scriptedProvider((turn) => {
      prompts.push(turn.prompt);
      sessions.push(turn.resumeSession);
      return (
        [
          "Verification still pending.",
          `All required checks passed.\n${complete}`,
          "<pr-body>A release note using custom structure.</pr-body>",
        ][prompts.length - 1] ?? ""
      );
    });
    fixture.config.workflow = { maxIterations: { "repair-and-verify": 2 } };
    fixture.config.lifecycle = {
      prepareCommand: "true",
      async beforeExecutor({ phase }) {
        if (phase === "repair-and-verify") return { env: { REPAIR_RESOURCE: "registered" } };
      },
    };
    fixture.config.roles.repairerDeep = { provider: scripted };
    fixture.config.roles.repairer = { provider: scripted };
    fixture.agent = async (options) => {
      if (options.agent === scripted)
        return nativeRun({
          ...options,
          sandbox: noSandbox({ env: { GIT_CONFIG_GLOBAL: join(fixture.cwd, ".sandcastle", "sandbox.gitconfig") } }),
        });
    };
    const result = await fixture.execute();
    expect(result.delivered).toEqual([40]);
    expect(sessions).toEqual([undefined, "native-session", "native-session"]);
    expect(prompts[1]).toBe(prompts[0]);
    expect(prompts[2]).toContain("Re-emit only the missing <pr-body>");
    const repairs = fixture.calls.filter(({ agent }) => agent === scripted);
    expect(repairs.map(({ hooks }) => Boolean(hooks?.sandbox?.onSandboxReady?.length))).toEqual([true, true, false]);
    expect(repairs.map(({ sandbox }) => sandbox.env?.REPAIR_RESOURCE)).toEqual(["registered", "registered", undefined]);
    expect(repairs.map(({ maxIterations }) => maxIterations)).toEqual([1, 1, 1]);
    expect(fixture.body).toStartWith("A release note using custom structure.");
    expect(fixture.body).toContain("All required checks passed.");
  });
});

test("a matching existing PR remains recoverable even if no prior verification cache was available", async () => {
  await withWorkflow(async (fixture) => {
    fixture.beforeGitHub = async ([section, action, number]) => {
      if (section === "issue" && action === "edit" && number === "40") throw new Error("network unavailable");
    };
    const first = await fixture.execute();
    expect(first.incompleteSpecs).toEqual([40]);
    expect(fixture.labels.has(40)).toBe(true);
    expect(fixture.created).toBe(1);
    await rm(join(fixture.cwd, ".sandcastle", "state", "spec-40.json"));
    fixture.beforeGitHub = async ([section, action, number]) => {
      if (section === "issue" && action === "edit" && number === "41") throw new Error("second interruption");
    };
    const second = await fixture.execute();
    expect(second.incompleteSpecs).toEqual([40]);
    expect(fixture.labels.has(40)).toBe(false);
    fixture.calls.length = 0;
    fixture.beforeGitHub = async () => {};
    const third = await fixture.execute();
    expect(third.delivered).toEqual([40]);
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.created).toBe(1);
  });
});

test("candidate drift during either review prevents repair and publication", async () => {
  await withWorkflow(async (fixture) => {
    fixture.agent = async (options) => {
      if (options.name === "review-standards") {
        await commit(requiredCwd(options), "drift.txt", "unexpected reviewer write");
      }
    };
    const result = await fixture.execute();
    expect(result.incompleteSpecs).toEqual([40]);
    expect(fixture.calls.some(({ name }) => name === "repair-and-verify")).toBe(false);
    const head = await fixture.remoteHead();
    expect(head).toBeUndefined();
    expect(fixture.created).toBe(0);
  });
});

test("a cyclic slice stays blocked while its independent sibling integrates", async () => {
  await withWorkflow(
    async (fixture) => {
      fixture.blockers.set(42, [{ number: 43, state: "open" }]);
      fixture.blockers.set(43, [{ number: 42, state: "open" }]);
      fixture.agent = async (options) => {
        if (options.name === "plan") {
          expect(options.prompt).toContain("Ticket dependency cycle");
          return response("", plan([41]));
        }
      };
      const result = await fixture.execute();
      expect(result.integrated).toEqual([41]);
      expect(result.incompleteSpecs).toEqual([40]);
      expect(fixture.calls.map(({ name }) => name)).toEqual(["plan", "implement"]);
      expect(fixture.created).toBe(0);
    },
    [41, 42, 43],
  );
});

test("a legacy PID lock is ignored before starting an otherwise eligible Spec", async () => {
  await withWorkflow(async (fixture) => {
    const directory = join(fixture.cwd, ".sandcastle");
    await mkdir(directory);
    await writeFile(join(directory, "run.lock"), JSON.stringify({ pid: process.pid }));
    const result = await fixture.execute();
    expect(result.delivered).toEqual([40]);
  });
});

test.each([
  { name: "failed preparation", command: "exit 17", timeout: 1_000, message: "exit 17" },
  { name: "timed-out preparation", command: "sleep 1", timeout: 30, message: "timed out" },
])(
  "native ready hook stops before hook installation and model startup after $name",
  async ({ command, timeout, message }) => {
    await withWorkflow(async (fixture) => {
      let started = false;
      const scripted = scriptedProvider(() => {
        started = true;
        return complete;
      });
      fixture.config.roles.implementers = { standard: { provider: scripted } };
      fixture.config.lifecycle = {
        prepareCommand: command,
        prepareTimeoutMs: timeout,
        hooksCommand: "mkdir -p .sandcastle && touch .sandcastle/hook-ran",
      };
      fixture.agent = async (options) => {
        if (options.agent === scripted) {
          return nativeRun({
            ...options,
            sandbox: noSandbox({ env: { GIT_CONFIG_GLOBAL: join(fixture.cwd, ".sandcastle", "sandbox.gitconfig") } }),
          });
        }
      };
      const result = await fixture.execute();
      expect(result.failed).toEqual([41]);
      expect(fixture.reports.join("\n")).toContain(message);
      expect(started).toBe(false);
      const marker = join(fixture.checkout(ticketBranch(41)), ".sandcastle", "hook-ran");
      const error = await readFile(marker).catch((reason: unknown) => reason);
      expect(error).toMatchObject({ code: "ENOENT" });
    });
  },
);

test("only writable sessions receive hook configuration and run the resource lifecycle", async () => {
  await withWorkflow(async (fixture) => {
    const allocated: string[] = [];
    const cleaned: string[] = [];
    const hookEnv = {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: "/tmp/fixture-hooks",
    };
    fixture.config.sandbox = {
      ...fixture.config.sandbox,
      env: { SHARED_SETTING: "fixture" },
      writable: { env: hookEnv },
    };
    fixture.config.lifecycle = {
      hooksCommand: "install-hooks",
      async beforeExecutor({ phase }) {
        allocated.push(phase);
        return { env: { RESOURCE_REGISTRY: phase } };
      },
      async afterExecutor(_context, inputs) {
        cleaned.push(inputs?.env?.RESOURCE_REGISTRY ?? "missing");
      },
    };
    fixture.agent = async ({ name }) => {
      if (name === "plan") return response("", plan([41], true));
    };
    const result = await fixture.execute();
    expect(result.delivered).toEqual([40]);
    expect(allocated).toEqual(["implement", "repair-and-verify"]);
    expect(cleaned).toEqual(allocated);
    expect(fixture.calls.map(({ name }) => name).toSorted()).toEqual([
      "explore",
      "implement",
      "plan",
      "repair-and-verify",
      "review-spec",
      "review-standards",
    ]);
    for (const { name, sandbox, hooks } of fixture.calls) {
      if (name === "implement" || name === "repair-and-verify") {
        expect(sandbox?.env).toEqual({ SHARED_SETTING: "fixture", ...hookEnv, RESOURCE_REGISTRY: name });
        expect(hooks?.sandbox?.onSandboxReady).toBeDefined();
      } else {
        expect(sandbox?.env).toEqual({ SHARED_SETTING: "fixture" });
        expect(hooks).toBeUndefined();
      }
    }
  });
});

test("an executor error leaves its test resource registry available for recovery", async () => {
  await withWorkflow(async (fixture) => {
    const registry = join(fixture.cwd, ".sandcastle", "test-resource-registry");
    fixture.config.lifecycle = {
      async beforeExecutor() {
        await writeFile(registry, "owned resource");
      },
      async afterExecutor() {
        await rm(registry);
      },
    };
    fixture.agent = async ({ name }) => {
      if (name === "implement") throw new Error("sandbox exit unconfirmed");
    };
    const result = await fixture.execute();
    const retained = await readFile(registry, "utf8").catch((error: unknown) => error);
    expect(result.failed).toEqual([41]);
    expect(retained).toBe("owned resource");
  });
});

test("a completion marker without a verification handoff cannot integrate a ticket", async () => {
  await withWorkflow(async (fixture) => {
    fixture.agent = async (options) => {
      if (options.name !== "implement") return;
      await commit(requiredCwd(options), "missing-handoff.txt", "implementation without evidence");
      return response(complete);
    };
    const result = await fixture.execute();
    expect(result.integrated).toEqual([]);
    expect(result.failed).toEqual([41]);
    expect(result.incompleteSpecs).toEqual([40]);
    expect(fixture.created).toBe(0);
    expect(fixture.comments.get(41)).toBeUndefined();
  });
});

test("a resumed ticket must contain its current dispatch baseline", async () => {
  await withWorkflow(async (fixture) => {
    fixture.agent = async (options) => {
      if (options.name !== "implement") return;
      await commit(requiredCwd(options), "preserved.txt", "work from the old baseline");
      return response("Interrupted before validation");
    };
    const first = await fixture.execute();
    expect(first.failed).toEqual([41]);

    await commit(fixture.checkout(specBranch), "design.txt", "updated integration baseline");
    fixture.agent = undefined;
    const second = await fixture.execute();
    expect(second.integrated).toEqual([]);
    expect(second.failed).toEqual([41]);
    expect(fixture.created).toBe(0);
  });
});

test.each(["withdrawn label", "another assignee"])("a delayed ticket is held after a %s", async (change) => {
  await withWorkflow(
    async (fixture) => {
      fixture.blockers.set(42, [{ number: 41, state: "open" }]);
      fixture.agent = async (options) => {
        if (options.name === "implement" && requiredCwd(options).endsWith("-41")) {
          if (change === "withdrawn label") fixture.labels.delete(42);
          else fixture.assignees.set(42, ["someone-else"]);
        }
      };
      const result = await fixture.execute({ maxParallel: 1 });
      expect(result.integrated).toEqual([41]);
      expect(result.incompleteSpecs).toEqual([40]);
      expect(fixture.calls.filter(({ name }) => name === "implement")).toHaveLength(1);
    },
    [41, 42],
  );
});

test("a closed ticket blocks its dependents while an independent ticket integrates", async () => {
  await withWorkflow(
    async (fixture) => {
      fixture.closed.add(42);
      fixture.blockers.set(43, [{ number: 42, state: "closed" }]);
      fixture.agent = async ({ name }) => {
        if (name === "plan") return response("", plan([41]));
      };
      const result = await fixture.execute();
      expect(result.integrated).toEqual([41]);
      expect(result.incompleteSpecs).toEqual([40]);
      expect(fixture.created).toBe(0);
    },
    [41, 42, 43],
  );
});

test("an invalid ticket checkout preserves the ticket and lets an in-flight sibling integrate", async () => {
  await withWorkflow(
    async (fixture) => {
      const bothStarted = Promise.withResolvers<void>();
      let started = 0;
      fixture.agent = async (options) => {
        if (options.name !== "implement") return;
        const cwd = requiredCwd(options);
        if (++started === 2) bothStarted.resolve();
        await bothStarted.promise;
        if (cwd.endsWith("-41")) {
          await writeFile(join(cwd, "dirty.txt"), "preserve uncommitted work");
          return response(`Claimed successful verification.\n${complete}`);
        }
      };
      const result = await fixture.execute({ maxParallel: 2 });
      const dirty = await readFile(join(fixture.checkout(ticketBranch(41)), "dirty.txt"), "utf8");
      expect(dirty).toBe("preserve uncommitted work");
      expect(result.failed).toEqual([41]);
      expect(result.integrated).toEqual([42]);
      expect(result.incompleteSpecs).toEqual([40]);
    },
    [41, 42],
  );
});

test.each([true, false])("an open Spec reserves its declared branch with ready label = %p", async (ready) => {
  await withWorkflow(async (fixture) => {
    fixture.specs.set(50, { branch: specBranch, numbers: [51] });
    if (ready) fixture.labels.add(50);
    fixture.labels.add(51);
    const result = await fixture.execute();
    expect(result.incompleteSpecs).toContain(40);
    expect(fixture.reports.join("\n")).toContain("#50");
    expect(fixture.calls).toEqual([]);
    const refs = await fixture.git("branch", "--list", specBranch);
    expect(refs).toBe("");
  });
});

test("an outdated integration branch leaves the independent Spec runnable", async () => {
  await withWorkflow(async (fixture) => {
    const staleBranch = "feat/stale";
    const oldTip = await fixture.git("commit-tree", "HEAD^{tree}", "-m", "Unrelated baseline");
    await fixture.git("branch", staleBranch, oldTip);
    fixture.specs.set(50, { branch: staleBranch, numbers: [51] });
    fixture.labels.add(50);
    fixture.labels.add(51);
    const result = await fixture.execute({ maxSpecs: 2 });
    expect(result.incompleteSpecs).toEqual([50]);
    expect(result.delivered).toEqual([40]);
    expect(fixture.reports.join("\n")).toContain("Spec does not include the invocation base");
    expect(await fixture.git("rev-parse", staleBranch)).toBe(oldTip);
  });
});
