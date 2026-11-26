import { expect, test } from "bun:test";
import { createGitHubIssueTracker, specFrontier } from "../github.ts";
import { connectGitHubProject } from "../projects.ts";

const repo = "team/engine";
const repository_url = `https://api.github.com/repos/${repo}`;

function issue(number: number, type: "spec" | "ticket" = "ticket", state = "open") {
  return {
    number,
    title: `Issue ${number}`,
    body: "",
    state,
    repository_url,
    labels: [{ name: `type:${type}` }, { name: "ready-for-agent" }],
    assignees: [],
  };
}

test("the native paginated graph trusts CLOSED only for external prerequisites", async () => {
  const external = { ...issue(42, "ticket", "closed"), repository_url: "https://api.github.com/repos/other/engine" };
  const edges = new Map([
    [41, [external]],
    [43, [issue(42, "ticket", "closed")]],
    [44, [issue(45)]],
    [45, [issue(44)]],
  ]);
  const tracker = createGitHubIssueTracker({ cwd: ".", repo }, async (args) => {
    const path = args[1]?.split("?")[0] ?? "";
    if (path === `repos/${repo}/issues`) {
      expect(args).toContain("--paginate");
      return JSON.stringify(issue(40, "spec"));
    }
    const number = Number(path.split("/")[4]);
    if (path.endsWith("/sub_issues")) {
      expect(args).toContain("--paginate");
      return [41, 42, 43, 44, 45].map((id) => JSON.stringify(issue(id))).join("\n");
    }
    if (path.endsWith("/blocked_by")) {
      expect(args).toContain("--paginate");
      return (edges.get(number) ?? []).map((blocker) => JSON.stringify(blocker)).join("\n");
    }
    if (path.endsWith("/parent")) return JSON.stringify(issue(40, "spec"));
    return JSON.stringify(issue(number, "ticket", number === 42 ? "closed" : "open"));
  });
  const [graph] = await tracker.loadBacklog();
  if (!graph) throw new Error("Expected a ready Spec");
  const initial = specFrontier(graph);
  expect(initial.ready.map(({ number }) => number)).toEqual([41]);
  expect(initial.blocked.find(({ number }) => number === 43)?.reasons.join()).toContain("not integrated");
  expect(initial.blocked.find(({ number }) => number === 44)?.reasons.join()).toContain("cycle");
  const resumed = specFrontier(graph, { integrated: new Set([42]) });
  expect(resumed.ready.map(({ number }) => number)).toEqual([41, 43]);
});

test("Projects validates only configured columns and silently skips unmapped stages", async () => {
  const calls: string[][] = [];
  const report = await connectGitHubProject(
    {
      cwd: ".",
      repo,
      url: "https://github.com/orgs/team/projects/1",
      fieldName: "Delivery state",
      stageMap: { Implementing: "In flight" },
    },
    async (args) => {
      calls.push(args);
      if (args.includes("fieldName=Delivery state"))
        return JSON.stringify({
          data: {
            owner: {
              projectV2: {
                id: "project",
                closed: false,
                viewerCanUpdate: true,
                field: { id: "status", options: [{ id: "active", name: "In flight" }] },
              },
            },
          },
        });
      if (args.includes("number=41")) return JSON.stringify({ data: { repository: { issue: { id: "issue" } } } });
      if (args.includes("content=issue"))
        return JSON.stringify({ data: { addProjectV2ItemById: { item: { id: "item" } } } });
      if (args.includes("option=active"))
        return JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "item" } } } });
      throw new Error("Unexpected Projects API call");
    },
  );
  await report(41, "Reviewing");
  expect(calls).toHaveLength(1);
  await report(41, "Implementing");
  expect(calls.at(-1)).toContain("option=active");
  const disabled = await connectGitHubProject(
    { cwd: ".", repo, url: "https://github.com/orgs/team/projects/1", stageMap: {} },
    async () => {
      throw new Error("No Projects API call expected for an empty mapping");
    },
  );
  await disabled(41, "Done");
});
