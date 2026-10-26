import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { codex, type RunOptions, run } from "@ai-hero/sandcastle";
import { shellQuote } from "./codex-provider.mts";
import { command } from "./commands.ts";
import { snapshotHostHooks } from "./hook-smoke.mts";
import { createRuntime } from "./runtime.mts";
import type { TrackedIssue } from "./specs.ts";
import type { WorkspaceAgentInput } from "./ticket-runtime.mts";
import { runWorkflow, type WorkflowResult } from "./workflow.ts";
import { workspaceDependencyPaths } from "./workspace-dependencies.mts";

const complete = "<promise>COMPLETE</promise>";
type Scenario = "complete" | "interrupt" | "close-interrupt";

/** A controlled external model, shared by host Integration and real SDK/Docker smoke. */
function modelProgram() {
  const fs = require("node:fs");
  const path = require("node:path");
  const { execFileSync } = require("node:child_process");
  const { control, stage, args, firstRun, docker, dependencyPaths } = JSON.parse(process.argv[2]!);
  const git = (...values: string[]) => execFileSync("git", values, { encoding: "utf8" }).trim();
  const mark = (name: string) => fs.writeFileSync(path.join(control, name), "observed\n");
  const exists = (name: string) => fs.existsSync(path.join(control, name));
  const wait = async (name: string) => {
    const deadline = Date.now() + 180_000;
    while (!exists(name)) {
      if (exists("interrupt")) return false;
      if (Date.now() > deadline) throw new Error(`Controlled model never observed ${name}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return true;
  };
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  };
  const commit = (file: string, body: string) => {
    fs.writeFileSync(file, body);
    git("add", file, ...(fs.existsSync("unfinished.txt") ? ["unfinished.txt"] : []));
    git("commit", "-m", `Controlled ${stage} ${args.ISSUE_NUMBER ?? args.SPEC_NUMBER}`);
  };
  let prompt = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    prompt += chunk;
  });
  process.stdin.on("end", async () => {
    try {
      check(prompt.length > 0, "Model command received no prompt on stdin");
      fs.writeFileSync(path.join(control, `${stage}-${args.ISSUE_NUMBER ?? "spec"}-${firstRun}.prompt.md`), prompt);
      if (docker) check(process.getuid?.() === 1000, "Model command must run as UID 1000");
      if (docker && stage !== "plan")
        for (const directory of dependencyPaths)
          check(!fs.existsSync(path.join(directory, "host-sentinel")), "Host dependencies leaked into the sandbox");
      let response = "Controlled executor: focused checks passed.";
      if (stage === "plan") {
        const backlog = JSON.parse(args.SPEC_BACKLOG);
        const graph = backlog.find((entry: { frontier: { ready: unknown[] } }) => entry.frontier.ready.length);
        response = `<plan>${JSON.stringify({
          spec: graph?.spec.number ?? null,
          issues:
            graph?.frontier.ready.map((issue: { number: number; title: string }) => ({
              number: issue.number,
              title: issue.title,
              branch: `codex/sandcastle/issue-${issue.number}`,
              implementer: "implementer_deep",
              reason: "Controlled cross-stage lifecycle fixture",
            })) ?? [],
        })}</plan>`;
      } else if (stage === "implement") {
        const number = Number(args.ISSUE_NUMBER);
        mark(`started-${number}`);
        if (number === 41) await wait("started-42");
        if (number === 42 && firstRun) {
          if (!(await wait("executor-started-43"))) {
            fs.writeFileSync("unfinished.txt", "preserved from interrupted model command\n");
            console.log(
              JSON.stringify({
                type: "item.completed",
                item: { type: "agent_message", text: "Interrupted; preserve unfinished work." },
              }),
            );
            return;
          }
        }
        if (number === 43) {
          check(fs.readFileSync("41.txt", "utf8") === "implemented 41\n", "C started before A was integrated");
          check(exists("executor-started-43"), "C never entered its execution boundary");
        }
        if (number === 42 && !firstRun)
          check(
            fs.readFileSync("unfinished.txt", "utf8") === "preserved from interrupted model command\n",
            "Recovery discarded unfinished work",
          );
        git("merge", "--no-edit", args.INTEGRATION_SHA);
        commit(`${number}.txt`, `implemented ${number}\n`);
        mark(`finished-${number}`);
      } else if (stage === "ticket-accept") {
        check(git("rev-parse", "HEAD") === args.CANDIDATE_SHA, "Acceptance candidate drifted");
        git("merge", "--no-edit", args.INTEGRATION_SHA);
        check(
          fs.readFileSync(`${args.ISSUE_NUMBER}.txt`, "utf8") === `implemented ${args.ISSUE_NUMBER}\n`,
          "Acceptance lost implementation",
        );
      } else {
        check(git("rev-parse", "HEAD") === args.REVIEW_CANDIDATE, "Final review/repair candidate mismatch");
        check(git("status", "--porcelain") === "", "Final candidate must be clean");
        for (const number of [41, 42, 43])
          check(fs.existsSync(`${number}.txt`), "Final review saw partial integration");
        if (stage === "spec-review") {
          response = `Controlled Standards report: candidate ${args.REVIEW_CANDIDATE}; add repair.txt.\nControlled Spec report: ABC integrated at ${args.REVIEW_CANDIDATE}.`;
        } else {
          check(args.REVIEW_REPORT.includes(args.REVIEW_CANDIDATE), "Repair did not receive fixed-candidate reports");
          commit("repair.txt", "central repair verified\n");
          response =
            "Controlled repair executor: finding handled and fixture validation passed; model quality and real pnpm verify are outside this fixture.";
        }
      }
      console.log(JSON.stringify({ type: "thread.started", thread_id: `controlled-${stage}` }));
      console.log(
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: `${response}\n<promise>COMPLETE</promise>` },
        }),
      );
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

export async function controlledWorkflowJourney(options: {
  sourceCwd: string;
  mode: "host" | "docker";
  scenario: Scenario;
  image?: string;
  signal?: AbortSignal;
  maxParallel?: number;
}) {
  const { sourceCwd, mode, scenario } = options;
  const root = await mkdtemp(join(tmpdir(), "iam-afk-workflow-smoke-"));
  const cwd = join(root, "repository");
  const control = join(root, "control");
  const git = (...args: string[]) => command("git", args, cwd);
  const records = new Map<number, TrackedIssue>();
  const closed: number[] = [];
  const stages: string[] = [];
  let firstRun = true;
  let controller = new AbortController();
  let succeeded = false;
  const startedAt = Date.now();
  let interrupted = false;
  let closeFailed = false;
  let sawDynamicUnlock = false;
  let unlockIntegration: string | undefined;
  let dependencyIsolationChecks = 0;
  const sourceHooksBefore = mode === "docker" ? await snapshotHostHooks(sourceCwd, sourceCwd) : undefined;
  const verify = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const issue = (number: number, type: "spec" | "ticket", parent: number | null = null, blockers: number[] = []) => {
    records.set(number, {
      number,
      title: `controlled ${type} ${number}`,
      body: "Controlled fixture acceptance",
      state: "OPEN",
      labels: [`type:${type}`, "ready-for-agent"],
      assignees: [],
      parent,
      blockers,
      comments: [],
    });
  };
  issue(40, "spec");
  issue(41, "ticket", 40);
  issue(42, "ticket", 40);
  issue(43, "ticket", 40, [41]);
  issue(50, "spec");
  issue(51, "ticket", 50);
  const runGh = async (args: string[]): Promise<string> => {
    if (args[0] === "api") {
      if (args[1] === "user") return "controlled-runner";
      const endpoint = args[1]!;
      verify(endpoint.startsWith("repos/cyy1998/shgas-iam/"), "Unexpected GitHub repository");
      const number = Number(/issues\/(\d+)/.exec(endpoint)?.[1]);
      let values: unknown[];
      if (endpoint.includes("/comments?"))
        values = records.get(number)!.comments!.map((entry) => ({ body: entry.body, user: { login: entry.author } }));
      else if (endpoint.includes("/sub_issues?"))
        values = [...records.values()].filter((entry) => entry.parent === number);
      else if (endpoint.includes("/dependencies/blocked_by?"))
        values = records.get(number)!.blockers.map((number) => ({ number }));
      else if (endpoint.includes("issues?state=open&labels=type%3Aspec"))
        values = [...records.values()].filter((entry) => entry.labels.includes("type:spec") && entry.state === "OPEN");
      else throw new Error(`Unexpected controlled GitHub API: ${endpoint}`);
      return JSON.stringify([values.slice(0, 1), values.slice(1)]);
    }
    verify(
      args[0] === "issue" && args.includes("--repo") && args[args.indexOf("--repo") + 1] === "cyy1998/shgas-iam",
      "Unexpected gh operation",
    );
    const number = Number(args[2]);
    const record = records.get(number)!;
    verify(record, `Unknown controlled issue #${number}`);
    if (args[1] === "view") {
      if (args.includes("--jq")) return record.state;
      return JSON.stringify({
        ...record,
        labels: record.labels.map((name) => ({ name })),
        assignees: record.assignees.map((login) => ({ login })),
        parent: record.parent ? { number: record.parent } : null,
      });
    }
    if (args[1] === "comment") {
      const body = await readFile(args[args.indexOf("--body-file") + 1]!, "utf8");
      record.comments!.push({ body, author: "controlled-runner" });
      if (number === 41 && body.startsWith("Spec #40 的票级集成已完成")) {
        verify((await git("rev-parse", "main")) === base, "Ticket integration prematurely moved invocation branch");
        verify(
          [...records.values()].every((entry) => entry.state === "OPEN"),
          "Ticket integrated after premature close",
        );
        if (scenario === "interrupt" && firstRun) {
          interrupted = true;
          await writeFile(join(control, "interrupt"), "stop\n");
          controller.abort(new Error("Controlled interruption after A integration"));
        }
      }
      return "controlled comment";
    }
    if (args[1] === "close") {
      verify((await git("rev-list", "--count", `${base}..main`)) === "1", "Issue closed before one real squash");
      verify(
        (await git("show", "main:repair.txt")) === "central repair verified",
        "Issue closed before repaired candidate delivery",
      );
      if (scenario === "close-interrupt" && number === 42 && firstRun) {
        closeFailed = true;
        throw new Error("Controlled GitHub outage after first close");
      }
      verify(record.state === "OPEN", "Closed the same issue twice");
      record.state = "CLOSED";
      closed.push(number);
      return "";
    }
    throw new Error(`Unexpected controlled gh: ${args.join(" ")}`);
  };
  let base = "";
  try {
    await mkdir(control, { recursive: true });
    await writeFile(join(control, "model.cjs"), `const __name = (fn) => fn; (${modelProgram.toString()})()`);
    await mkdir(join(control, "bin"));
    // Fail closed even if future prompts start shell preprocessing with gh/codex.
    for (const name of ["gh", "codex"])
      await writeFile(
        join(control, "bin", name),
        "#!/bin/sh\necho 'Unexpected network/model command in controlled smoke' >&2\nexit 98\n",
        { mode: 0o755 },
      );
    if (mode === "docker") {
      // The Linux sandbox must not inherit host-only absolute object alternates.
      await command("git", ["clone", "--no-hardlinks", "--no-checkout", sourceCwd, cwd], root);
      await git("checkout", "-b", "main", await command("git", ["rev-parse", "HEAD"], sourceCwd));
    } else {
      await mkdir(cwd);
      await git("init", "--initial-branch=main");
      await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "controlled-workflow", private: true }));
      await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages: []\n");
    }
    await git("config", "user.name", "Controlled Sandcastle");
    await git("config", "user.email", "sandcastle@example.invalid");
    await git("config", "commit.gpgsign", "false");
    await git("config", "core.autocrlf", "false");
    await git("config", "core.hooksPath", join(root, "host-no-hooks"));
    for (const directory of [".codex/agents", ".sandcastle"]) {
      await mkdir(join(cwd, directory), { recursive: true });
      for (const name of await readdir(join(sourceCwd, directory)))
        if (name.endsWith(".md") || name.endsWith(".toml"))
          await cp(join(sourceCwd, directory, name), join(cwd, directory, name));
    }
    const ignored = await readFile(join(cwd, ".gitignore"), "utf8").catch(() => "");
    await writeFile(
      join(cwd, ".gitignore"),
      `${ignored}\nnode_modules/\n.sandcastle/logs/\n.sandcastle/resources/\n.sandcastle/worktrees/\ntest-results/\n`,
    );
    await git("add", ".");
    await git("commit", "--allow-empty", "-m", "Controlled workflow baseline");
    base = await git("rev-parse", "HEAD");
    const dependencyPaths = mode === "docker" ? await workspaceDependencyPaths(cwd) : [];
    const fixtureHooksBefore = mode === "docker" ? await snapshotHostHooks(cwd, cwd) : undefined;
    const modelInput = (input: WorkspaceAgentInput) => {
      const stage = basename(input.promptFile, "-prompt.md");
      stages.push(`${stage}:${input.promptArgs.ISSUE_NUMBER ?? "spec"}`);
      if (mode === "docker")
        verify(
          input.role?.name ===
            (["implement", "ticket-accept", "spec-repair-and-verify"].includes(stage) ? "implementer_deep" : undefined),
          "The effective execution role did not match the Spec risk and stage",
        );
      if (stage === "implement") {
        records.get(Number(input.promptArgs.ISSUE_NUMBER))!.assignees = ["controlled-runner"];
        records.get(40)!.assignees = ["controlled-runner"];
      }
      return { stage, args: input.promptArgs, firstRun, docker: mode === "docker", dependencyPaths };
    };
    const observeExecutionStart = async (input: RunOptions) => {
      const args = input.promptArgs as Record<string, string>;
      if (basename(input.promptFile!, "-prompt.md") !== "implement" || args.ISSUE_NUMBER !== "43") return;
      if (firstRun) verify(!existsSync(join(control, "finished-42")), "C execution waited for independent B");
      // Observe the real execution call, including SDK preparation, rather than timing dependency installation.
      verify(
        (await readFile(join(input.cwd!, "41.txt"), "utf8")) === "implemented 41\n",
        "C checkout lacks integrated A",
      );
      // An independent peer may integrate after C captured its valid implementation baseline.
      await command("git", ["merge-base", "--is-ancestor", args.INTEGRATION_SHA!, "codex/sandcastle/spec-40"], cwd);
      await command("git", ["merge-base", "--is-ancestor", args.INTEGRATION_SHA!, "HEAD"], input.cwd!);
      await writeFile(join(control, "executor-started-43"), args.INTEGRATION_SHA!);
      if (firstRun) {
        sawDynamicUnlock = true;
        unlockIntegration = args.INTEGRATION_SHA;
      }
    };
    const hostRun = async (input: RunOptions) => {
      await observeExecutionStart(input);
      const args = modelInput({
        worktreePath: input.cwd!,
        name: input.name!,
        promptFile: input.promptFile!,
        promptArgs: input.promptArgs as Record<string, string>,
      });
      const template = await readFile(input.promptFile!, "utf8");
      const prompt = template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => args.args[name] ?? "");
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [join(control, "model.cjs"), JSON.stringify({ ...args, control })], {
          cwd: input.cwd,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.once("error", reject);
        child.once("close", (code) =>
          code === 0 ? resolve(stdout) : reject(new Error(`Controlled model failed (${code}): ${stderr}`)),
        );
        child.stdin.end(prompt);
      });
      const messages = stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line))
        .filter((event) => event.type === "item.completed")
        .map((event) => event.item.text)
        .join("\n");
      return { stdout: messages, completionSignal: messages.includes(complete) ? complete : undefined };
    };
    const execute = async () => {
      const runtime = await createRuntime(
        {
          cwd,
          branch: "main",
          image: options.image ?? "iam-sandcastle:local",
          model: "controlled-no-model",
          signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
        },
        {
          runGh,
          prepareAuth: async () => ({
            mode: "api-key",
            env: { PATH: "/control/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" },
            mounts: [{ hostPath: control, sandboxPath: "/control" }],
            close: async () => {},
          }),
          ...(mode === "host"
            ? { run: hostRun }
            : {
                run: async (input: RunOptions) => {
                  await observeExecutionStart(input);
                  const workspace = basename(input.promptFile!, "-prompt.md") !== "plan";
                  if (workspace)
                    for (const path of dependencyPaths) {
                      await mkdir(join(input.cwd!, path), { recursive: true });
                      await writeFile(join(input.cwd!, path, "host-sentinel"), "host dependencies\n");
                    }
                  const result = await run(input);
                  if (workspace)
                    for (const path of dependencyPaths) {
                      verify(
                        (await readFile(join(input.cwd!, path, "host-sentinel"), "utf8")) === "host dependencies\n",
                        "SDK changed host dependency files",
                      );
                      dependencyIsolationChecks++;
                    }
                  return result;
                },
                agent: (input: WorkspaceAgentInput) => {
                  const args = modelInput(input);
                  return {
                    ...codex("controlled-no-model", { captureSessions: false }),
                    buildPrintCommand: ({ prompt }: { prompt: string }) => ({
                      command: `node /control/model.cjs ${shellQuote(JSON.stringify({ ...args, control: "/control" }))}`,
                      stdin: prompt,
                    }),
                  };
                },
              }),
        },
      );
      try {
        return await runWorkflow({ ...(options.maxParallel ? { maxParallel: options.maxParallel } : {}) }, runtime);
      } finally {
        await runtime.close();
      }
    };
    let result: WorkflowResult | undefined;
    let failure: unknown;
    try {
      result = await execute();
    } catch (error) {
      failure = error;
    }
    if (scenario !== "complete") {
      verify(failure, "Interruption did not stop the first invocation");
      if (scenario === "interrupt") {
        verify(interrupted, "Partial integration interruption was not reached");
        verify((await git("rev-parse", "HEAD")) === base, "Partial work was delivered");
        verify(closed.length === 0, "Partial Spec closed issues");
        verify(
          (await git("worktree", "list", "--porcelain")).includes("codex/sandcastle/issue-42"),
          "Interrupted ticket worktree was removed",
        );
      } else {
        verify(closeFailed && closed.join(",") === "41", "Did not stop after partial close");
      }
      const before = await git("rev-parse", "HEAD");
      const beforeStages = stages.length;
      firstRun = false;
      controller = new AbortController();
      await rm(join(control, "interrupt"), { force: true });
      result = await execute();
      const resumed = stages.slice(beforeStages);
      verify(!resumed.includes("implement:41"), "Recovery repeated accepted A implementation");
      if (scenario === "close-interrupt") {
        verify((await git("rev-parse", "HEAD")) === before, "Recovery repeated squash");
        verify(resumed.length === 0, "Delivered recovery restarted a model session");
      }
    } else if (failure) throw failure;
    verify(result?.delivered.join(",") === "40", "The production runtime did not deliver exactly the selected Spec");
    const squash = await git("rev-parse", "HEAD");
    verify(
      (await git("rev-list", "--parents", "-n", "1", squash)) === `${squash} ${base}`,
      "Delivery is not a single-parent squash",
    );
    verify((await git("status", "--porcelain")) === "", "Invocation checkout is dirty");
    const remainingWorktrees = (await git("worktree", "list", "--porcelain")).match(/^worktree /gm)?.length ?? 0;
    verify(remainingWorktrees === 1, "Delivery left registered ticket/integration worktrees");
    verify(
      (await git("for-each-ref", "--format=%(refname)", "refs/heads/codex/sandcastle")) === "",
      "Delivery left workflow branches",
    );
    if (mode === "docker") {
      verify(
        (await snapshotHostHooks(sourceCwd, sourceCwd)) === sourceHooksBefore,
        "Workflow changed caller Git/hooks",
      );
      verify((await snapshotHostHooks(cwd, cwd)) === fixtureHooksBefore, "Workflow changed fixture Git/hooks");
    }
    const report = {
      scenario,
      mode,
      delivered: result!.delivered,
      closed,
      commits: Number(await git("rev-list", "--count", `${base}..HEAD`)),
      remainingWorktrees,
      startedBeforeBFinished: sawDynamicUnlock ? [41, 43] : [],
      dynamicStart: { boundary: "SDK run including workspace preparation", integration: unlockIntegration },
      dependencyIsolationChecks,
      unattemptedSpec: records.get(50)!.state,
      base,
      squash,
      stages,
      promptFiles: (await readdir(control)).filter((name) => name.endsWith(".prompt.md")),
      elapsedMs: Date.now() - startedAt,
    };
    if (mode === "docker") {
      const artifacts = join(sourceCwd, ".sandcastle", "resources", `workflow-smoke-${randomUUID()}`);
      await mkdir(artifacts, { recursive: true });
      await cp(control, join(artifacts, "controlled-model"), { recursive: true });
      await cp(join(cwd, ".sandcastle", "logs"), join(artifacts, "logs"), { recursive: true });
      await cp(join(cwd, ".sandcastle", "resources"), join(artifacts, "executors"), { recursive: true });
      await writeFile(join(artifacts, "report.json"), JSON.stringify(report, null, 2));
      await writeFile(join(artifacts, "github-fixture-report.json"), JSON.stringify([...records.values()], null, 2));
      console.log(`受控 Spec 工作流 smoke 通过；报告：${artifacts}`);
    }
    succeeded = true;
    return report;
  } finally {
    if (succeeded) await rm(root, { recursive: true, force: true });
    else {
      // Diagnostic export only: recovery above reads the external issue fixture, never this file.
      await writeFile(join(root, "github-fixture-report.json"), JSON.stringify([...records.values()], null, 2));
      console.error(`受控工作流失败；保留临时仓库、受控 GitHub 记录和执行器恢复材料：${root}`);
    }
  }
}
