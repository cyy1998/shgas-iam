import { expect, test } from "bun:test";
import { createGitHubIssueTracker, specFrontier } from "../github.ts";
import { connectGitHubProject } from "../projects.ts";

const repo = "team/engine";
const connection = <T>(nodes: T[], endCursor: string | null = null) => ({
  nodes,
  pageInfo: { hasNextPage: endCursor !== null, endCursor },
});

function issue(number: number, type: "spec" | "ticket" = "ticket", state = "OPEN", repository = repo) {
  return {
    number,
    title: `Issue ${number}`,
    body: "",
    state,
    repository: { nameWithOwner: repository },
    labels: connection([{ name: `type:${type}` }, { name: "ready-for-agent" }]),
    assignees: connection([]),
    blockedBy: connection([]),
  };
}

test("consolidated graph pages preserve native relationships and external CLOSED semantics", async () => {
  const spec = issue(40, "spec");
  const ticket = (number: number, blockers = connection<ReturnType<typeof issue>>([])) => ({
    ...issue(number, "ticket", number === 42 ? "CLOSED" : "OPEN"),
    parent: number === 46 ? issue(999, "spec") : spec,
    blockedBy: blockers,
  });
  const calls: string[][] = [];
  const tracker = createGitHubIssueTracker({ cwd: ".", repo }, async (args) => {
    calls.push(args);
    expect(args.slice(0, 2)).toEqual(["api", "graphql"]);
    if (args.includes("cursor0=blockers-41")) {
      return JSON.stringify({
        data: {
          repository: {
            page0: { ...issue(41), blockedBy: connection([issue(3, "ticket", "CLOSED", "other/engine")]) },
          },
        },
      });
    }
    const children = args.includes("cursor=children-page-2")
      ? connection([
          ticket(43, connection([issue(42, "ticket", "CLOSED")])),
          ticket(44, connection([issue(45)])),
          ticket(45, connection([issue(44)])),
          ticket(46),
        ])
      : connection(
          [ticket(41, connection([issue(42, "ticket", "CLOSED", "other/engine")], "blockers-41")), ticket(42)],
          "children-page-2",
        );
    return JSON.stringify({ data: { repository: { issue: { ...spec, subIssues: children } } } });
  });
  const graph = await tracker.loadSpecGraph(40);
  expect(calls).toHaveLength(3);
  expect(graph.spec.labels).toContain("type:spec");
  expect(graph.tickets.map(({ number }) => number)).toEqual([41, 42, 43, 44, 45, 46]);
  expect(graph.tickets[0]?.blockers.map(({ number }) => number)).toEqual([42, 3]);
  const initial = specFrontier(graph);
  expect(initial.ready.map(({ number }) => number)).toEqual([41]);
  expect(initial.blocked.find(({ number }) => number === 43)?.reasons.join()).toContain("not integrated");
  expect(initial.blocked.find(({ number }) => number === 44)?.reasons.join()).toContain("cycle");
  expect(initial.blocked.find(({ number }) => number === 46)?.reasons.join()).toContain("native parent");
  const resumed = specFrontier(graph, { integrated: new Set([42]) });
  expect(resumed.ready.map(({ number }) => number)).toEqual([41, 43]);
});

test.each(["EOF", "connection reset by peer", "gh: Bad Gateway (HTTP 502)", "gh: HTTP 503", "gh: HTTP 504"])(
  "an idempotent read retries a transient %s error",
  async (message) => {
    let calls = 0;
    const tracker = createGitHubIssueTracker({ cwd: ".", repo }, async () => {
      if (++calls === 1) throw Object.assign(new Error("Command failed: gh api"), { stderr: message });
      return JSON.stringify({
        number: 41,
        state: "open",
        title: "Issue 41",
        body: "",
        repository_url: `https://api.github.com/repos/${repo}`,
        labels: [],
        assignees: [],
      });
    });
    const actual = await tracker.readIssue(41);
    expect(actual).toMatchObject({ number: 41, state: "OPEN" });
    expect(calls).toBe(2);
  },
);

test.each([
  ["gh: Validation failed (HTTP 422): EOF", 1],
  ["gh: Resource not accessible by integration (HTTP 403)", 1],
  ["Could not resolve to an issue with number 41", 1],
  ["Get https://api.github.com/user: unexpected EOF", 3],
])("a failed read with %s ends after %i attempt(s)", async (message, attempts) => {
  const failure = new Error(message);
  let calls = 0;
  const tracker = createGitHubIssueTracker({ cwd: ".", repo }, async () => {
    calls++;
    throw failure;
  });
  const error = await tracker.readIssue(41).catch((reason: unknown) => reason);
  expect(error).toBe(failure);
  expect(calls).toBe(attempts);
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
