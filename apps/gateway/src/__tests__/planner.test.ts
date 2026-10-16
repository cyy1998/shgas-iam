import { describe, expect, it } from "bun:test";
import { planChanges } from "../planner";
import { createLoadedManifest, createResourceState, dynamicObject, repoObject } from "./test-helpers";

describe("apisix sync planning", () => {
  it("plans creates, updates, delete candidates, and ignored objects by source label", () => {
    const desiredRoute = repoObject({ id: "route-a", uri: "/a/*" });
    const manifest = createLoadedManifest({
      routes: [desiredRoute],
    });

    const plan = planChanges(
      manifest,
      createResourceState({
        routes: [
          repoObject({ id: "route-a", uri: "/changed/*" }),
          repoObject({ id: "route-b", uri: "/removed/*" }),
          dynamicObject({ id: "route-c", uri: "/dynamic/*" }),
          { id: "route-d", uri: "/manual/*" },
        ],
      }),
    );

    expect(plan.creates).toHaveLength(0);
    expect(plan.updates.map((change) => change.id)).toEqual(["route-a"]);
    expect(plan.deletes.map((change) => change.id)).toEqual(["route-b"]);
    expect(plan.ignored.map((change) => [change.id, change.reason])).toEqual([
      ["route-c", "dynamic"],
      ["route-d", "unmanaged"],
    ]);
  });

  it("does not plan deletes for repo-managed objects outside the selected app scope", () => {
    const desiredRoute = repoObject({ id: "route-a", uri: "/a/*", labels: { env: "prod", app: "tender" } });
    const manifest = createLoadedManifest(
      {
        routes: [desiredRoute],
      },
      { env: "prod", app: "tender" },
    );

    const plan = planChanges(
      manifest,
      createResourceState({
        routes: [
          repoObject({ id: "route-a", uri: "/a/*", labels: { env: "prod", app: "tender" } }),
          repoObject({ id: "route-b", uri: "/iam/*", labels: { env: "prod", app: "iam" } }),
        ],
      }),
    );

    expect(plan.deletes).toHaveLength(0);
    expect(plan.ignored.map((change) => [change.id, change.reason])).toEqual([["route-b", "out_of_scope"]]);
  });
});
