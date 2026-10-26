import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { command } from "../../sandcastle/commands";
import {
  assertTicketIssuesOpen,
  ExecutorInfrastructureError,
  recordTicketHandoff,
} from "../../sandcastle/ticket-runtime.mts";
import type { SpecWorkspace } from "../../sandcastle/tickets";
import { runWorkflow, type Ticket } from "../../sandcastle/workflow";

test("the production Node loader can import workflow limits without loading the model SDK through CommonJS", async () => {
  const cwd = fileURLToPath(new URL("../../..", import.meta.url));
  const source = `import { workflowLimits } from ${JSON.stringify(new URL("../../sandcastle/workflow.ts", import.meta.url).href)}; console.log(JSON.stringify(workflowLimits()));`;
  const stdout = await command("node", ["--import", "tsx", "--input-type=module", "-e", source], cwd);
  expect(JSON.parse(stdout)).toEqual({ maxSpecs: 1, maxParallel: 4 });
});

test("the production Node loader imports ordinary-record recovery without loading the model SDK", async () => {
  const cwd = fileURLToPath(new URL("../../..", import.meta.url));
  const source = `import { createSpecRecovery } from ${JSON.stringify(new URL("../../sandcastle/recovery.ts", import.meta.url).href)}; console.log(typeof createSpecRecovery);`;
  const stdout = await command("node", ["--import", "tsx", "--input-type=module", "-e", source], cwd);
  expect(stdout).toBe("function");
});

test.each(["read-state", "write-handoff"])(
  "a GitHub %s outage terminates the workflow instead of continuing another Spec",
  async (operation) => {
    const spec = {
      number: 10,
      title: "Spec",
      body: "",
      state: "OPEN" as const,
      labels: ["type:spec", "ready-for-agent"],
      assignees: [],
      parent: null,
      blockers: [],
    };
    const issue = { ...spec, number: 11, title: "Ticket", labels: ["type:ticket", "ready-for-agent"], parent: 10 };
    const workspace: SpecWorkspace = {
      graph: { spec, tickets: [issue], dependencies: [spec, issue] },
      branch: "codex/sandcastle/spec-10",
      worktreePath: "unused",
      invocationBranch: "main",
      invocationBase: "base",
    };
    const ticket: Ticket = {
      number: 11,
      title: "Ticket",
      branch: "codex/sandcastle/issue-11",
      implementer: "implementer_standard",
      reason: "Routine change",
    };
    const unavailable = async () => {
      throw new Error("GitHub unavailable");
    };
    let plans = 0;
    let integrations = 0;
    let caught: unknown;
    try {
      await runWorkflow(
        { maxSpecs: 2 },
        {
          plan: async () => {
            plans++;
            return { workspace, tickets: [ticket] };
          },
          frontier: async () => ({ tickets: [], complete: false, blocked: [] }),
          execute: async () => {
            if (operation === "read-state") await assertTicketIssuesOpen("unused", [11, 10], unavailable);
            else await recordTicketHandoff("unused", 11, "Retain recoverable work", unavailable);
            return true;
          },
          integrate: async () => {
            integrations++;
          },
          report: () => {},
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ExecutorInfrastructureError);
    expect(plans).toBe(1);
    expect(integrations).toBe(0);
  },
);
