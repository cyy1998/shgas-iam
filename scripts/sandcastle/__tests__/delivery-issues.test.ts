import { expect, test } from "bun:test";
import { closeDeliveredIssue } from "../delivery";
import { githubRepo } from "../github";
import { ExecutorInfrastructureError } from "../resources";

test.each(["OPEN", "unknown", "failed-close", "failed-read"])(
  "does not accept unconfirmed issue closeout: %s",
  async (scenario) => {
    const calls: string[][] = [];
    let caught: unknown;
    try {
      await closeDeliveredIssue("unused", 11, async (args) => {
        calls.push(args);
        if (scenario === "failed-close" || (scenario === "failed-read" && args[1] === "view"))
          throw new Error("GitHub unavailable");
        return args[1] === "close" ? "" : JSON.stringify({ number: 11, state: scenario });
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ExecutorInfrastructureError);
    expect(calls.every((args) => args.includes(githubRepo))).toBe(true);
  },
);

test("confirms the exact issue is closed after the GitHub mutation", async () => {
  const calls: string[][] = [];
  await closeDeliveredIssue("unused", 11, async (args) => {
    calls.push(args);
    return args[1] === "close" ? "" : JSON.stringify({ number: 11, state: "CLOSED" });
  });
  expect(calls.map((args) => args.slice(0, 3))).toEqual([
    ["issue", "close", "11"],
    ["issue", "view", "11"],
  ]);
});
