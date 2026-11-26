import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCode, codex } from "@ai-hero/sandcastle";
import { command } from "../command.ts";
import { defineSandcastleConfig } from "../config.ts";
import { resolveRepository } from "../git.ts";

test("config supplies neutral defaults and keeps mixed native providers and stage overrides", () => {
  const planner = { provider: claudeCode("planner") };
  const reviewer = { provider: codex("reviewer") };
  const config = defineSandcastleConfig({
    sandbox: { image: "test", dockerfile: "Dockerfile" },
    roles: {
      planner,
      researcher: planner,
      implementers: { standard: planner },
      reviewers: { standards: reviewer, spec: planner },
      repairer: planner,
      repairerDeep: reviewer,
    },
    workflow: { explore: false, maxIterations: { plan: 2 } },
  });
  expect(config.sandbox.dockerAccess).toBe(false);
  expect(config.workflow).toMatchObject({
    branchPrefix: "sandcastle",
    explore: false,
    review: true,
    projects: true,
    draft: false,
    maxIterations: { plan: 2, explore: 1, implement: 1, "resolve-conflict": 1, review: 1, "repair-and-verify": 1 },
  });
  expect(config.roles.reviewers.standards.provider).toBe(reviewer.provider);
});

test("repository identification works with real Git remotes and explicit overrides", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-repo-"));
  try {
    await command("git", ["init", "-b", "main"], cwd);
    await command("git", ["remote", "add", "upstream", "ssh://git@example.test:2222/team/engine.git"], cwd);
    await command("git", ["config", "branch.main.remote", "upstream"], cwd);
    const tracked = await resolveRepository(cwd, "main");
    expect(tracked).toEqual({ remote: "upstream", repo: "team/engine" });
    await command("git", ["remote", "set-url", "upstream", "git@example.test:other/repo.git"], cwd);
    const scp = await resolveRepository(cwd, "main");
    expect(scp.repo).toBe("other/repo");
    const explicit = await resolveRepository(cwd, "main", { repo: "target/engine" });
    expect(explicit.repo).toBe("target/engine");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
