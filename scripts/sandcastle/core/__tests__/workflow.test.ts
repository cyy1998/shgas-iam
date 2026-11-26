import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claudeCode,
  codex,
  run as nativeRun,
  type RunOptions,
  type RunResult,
  StructuredOutputError,
} from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { command } from "../command.ts";
import type { SandcastleConfig } from "../config.ts";
import { runWorkflow } from "../workflow.ts";

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

async function commit(cwd: string, file: string, value: string) {
  await writeFile(join(cwd, file), value);
  await command("git", ["add", "--", file], cwd);
  await command("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", value], cwd);
  return command("git", ["rev-parse", "HEAD"], cwd);
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
  function issue(number: number, state = "open", repository_url = repositoryUrl) {
    return {
      number,
      state,
      repository_url,
      title: `Issue ${number}`,
      body: number === 40 ? `Integration branch: ${specBranch}` : "",
      labels: [
        { name: number === 40 ? "type:spec" : "type:ticket" },
        ...(labels.has(number) ? [{ name: "ready-for-agent" }] : []),
      ],
      assignees: (assignees.get(number) ?? []).map((login) => ({ login })),
    };
  }
  const gh = async (args: string[]) => {
    await beforeGitHub(args);
    const [operation, action] = args;
    if (operation === "api") {
      if (action === "user") return JSON.stringify({ login: actor });
      if (action === "graphql") {
        const number = Number(args.find((arg) => arg.startsWith("number="))?.slice(7));
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
      if (path === `repos/${repo}/issues`) return labels.has(40) ? JSON.stringify(issue(40)) : "";
      const number = Number(path?.split("/")[4]);
      if (path?.endsWith("/dependencies/blocked_by")) {
        return (blockers.get(number) ?? [])
          .map((b) => JSON.stringify(issue(b.number, b.state, b.repository_url)))
          .join("\n");
      }
      if (path?.endsWith("/sub_issues")) return numbers.map((n) => JSON.stringify(issue(n))).join("\n");
      if (path?.endsWith("/parent")) return JSON.stringify(issue(40));
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
              return response(
                `Checks passed.\n<pr-body>Custom release summary</pr-body>\n${complete}`,
                "Custom release summary",
              );
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

test("failed final verification cannot trigger a format-only PR body request", async () => {
  await withWorkflow(async (fixture) => {
    fixture.agent = async (options) => {
      if (options.agent !== repairer.provider) return;
      throw new StructuredOutputError("PR body absent", {
        tag: "pr-body",
        rawMatched: undefined,
        sessionId: "fixture-session",
        branch: specBranch,
        commits: [],
      });
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

test("plans once, explores, dispatches independently ready tickets and reviews the same final merge in parallel", async () => {
  await withWorkflow(
    async (fixture) => {
      const implementations = Promise.withResolvers<void>();
      const reviews = Promise.withResolvers<void>();
      const started = new Set<number>();
      const reviewed: string[] = [];
      fixture.blockers.set(41, [
        { number: 400, state: "closed", repository_url: "https://api.github.com/repos/external/core" },
      ]);
      fixture.blockers.set(43, [{ number: 41, state: "open" }]);
      fixture.config.promptExtras = {
        plan: "Select the lightest adequate role.",
        "review-standards": { replace: "Apply the local project standards." },
      };
      fixture.config.workflow = {
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
      const remote = await fixture.remoteHead();
      if (!remote) throw new Error("Expected a published branch");
      expect(reviewed).toEqual([remote, remote]);
      const merges = await fixture.git("log", "--first-parent", "--merges", "--format=%B", `main..${specBranch}`);
      expect(merges.match(/^Sandcastle-Ticket: #\d+$/gm)?.toSorted()).toEqual([
        "Sandcastle-Ticket: #41",
        "Sandcastle-Ticket: #42",
        "Sandcastle-Ticket: #43",
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
          return response(complete);
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
          return response(complete);
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
      fixture.assignees.set(41, [actor]);
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
      return response(complete);
    };
    const restarted = await fixture.execute();
    expect(restarted.delivered).toEqual([40]);
    expect(fixture.calls.filter(({ name }) => name === "explore")).toHaveLength(1);
    expect(fixture.created).toBe(1);
    const content = await fixture.git("show", `${specBranch}:unfinished.txt`);
    expect(content).toBe("preserve this");
  });
});

test("an interrupted PR creation resumes from the exact verified SHA", async () => {
  await withWorkflow(async (fixture) => {
    fixture.beforeGitHub = async ([section, action]) => {
      if (section === "pr" && action === "create") throw new Error("network unavailable");
    };
    const first = await fixture.execute();
    expect(first.incompleteSpecs).toEqual([40]);
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

test("an interruption after label removal reuses the matching Open PR and only finishes pending handoffs", async () => {
  await withWorkflow(async (fixture) => {
    fixture.beforeGitHub = async ([section, action, number]) => {
      if (section === "issue" && action === "edit" && number === "41") throw new Error("network unavailable");
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
    expect(fixture.comments.get(41)).toHaveLength(1);
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
    expect(fixture.calls.map(({ name }) => name)).toEqual(["review-standards", "review-spec", "repair-and-verify"]);
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

test("a stale runner lock is reclaimed before starting an otherwise eligible Spec", async () => {
  await withWorkflow(async (fixture) => {
    const directory = join(fixture.cwd, ".sandcastle");
    await mkdir(directory);
    await writeFile(join(directory, "run.lock"), JSON.stringify({ pid: 2_147_483_647 }));
    const result = await fixture.execute();
    expect(result.delivered).toEqual([40]);
    const lock = await readFile(join(directory, "run.lock"), "utf8").catch((error: unknown) => error);
    expect(lock).toMatchObject({ code: "ENOENT" });
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
