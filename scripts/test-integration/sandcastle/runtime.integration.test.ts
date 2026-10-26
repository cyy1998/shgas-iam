import { expect, test } from "bun:test";
import { command } from "../../sandcastle/commands.ts";
import { controlledWorkflowJourney } from "../../sandcastle/workflow-smoke.mts";

test("the actual Node CLI loader opens help without loading model credentials", async () => {
  const help = await command("node", ["--import", "tsx", "scripts/sandcastle/main.mts", "--help"], process.cwd());
  expect(help).toContain("--iterations 1");
  expect(help).toContain("--parallel 4");
});

test("the production runtime dynamically integrates ABC and delivers one Spec before closing its issues", async () => {
  const report = await controlledWorkflowJourney({ sourceCwd: process.cwd(), mode: "host", scenario: "complete" });
  expect(report.delivered).toEqual([40]);
  expect(report.startedBeforeBFinished).toEqual([41, 43]);
  expect(report.closed).toEqual([41, 42, 43, 40]);
  expect(report.commits).toBe(1);
  expect(report.remainingWorktrees).toBe(1);
  expect(report.unattemptedSpec).toBe("OPEN");
}, 60_000);

test("a partial Spec resumes the preserved ticket branch without implementing accepted A again", async () => {
  const report = await controlledWorkflowJourney({
    sourceCwd: process.cwd(),
    mode: "host",
    scenario: "interrupt",
    maxParallel: 2,
  });
  expect(report.delivered).toEqual([40]);
  expect(report.closed).toEqual([41, 42, 43, 40]);
  expect(report.commits).toBe(1);
  expect(report.remainingWorktrees).toBe(1);
  expect(report.stages.filter((stage) => stage === "implement:41")).toHaveLength(1);
}, 60_000);

test("a delivered Spec resumes only remaining closeout after a partial GitHub outage", async () => {
  const report = await controlledWorkflowJourney({
    sourceCwd: process.cwd(),
    mode: "host",
    scenario: "close-interrupt",
    maxParallel: 2,
  });
  expect(report.delivered).toEqual([40]);
  expect(report.closed).toEqual([41, 42, 43, 40]);
  expect(report.commits).toBe(1);
  expect(report.remainingWorktrees).toBe(1);
  expect(report.stages.filter((stage) => stage === "spec-review:spec")).toHaveLength(1);
  expect(report.unattemptedSpec).toBe("OPEN");
}, 60_000);
