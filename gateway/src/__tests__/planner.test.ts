import { describe, expect, it } from "bun:test";
import { applyPlan } from "../applier";
import { planChanges } from "../planner";
import { createLoadedManifest, createResourceState, dynamicObject, repoObject } from "./test-helpers";

describe("apisix sync planning", () => {
  it("plans creates, updates, delete candidates, and ignored objects by source label", () => {
    const desiredRoute = repoObject({ id: "route-a", uri: "/a/*" });
    const manifest = createLoadedManifest({
      routes: [desiredRoute],
    });

    const plan = planChanges(manifest, createResourceState({
      routes: [
        repoObject({ id: "route-a", uri: "/changed/*" }),
        repoObject({ id: "route-b", uri: "/removed/*" }),
        dynamicObject({ id: "route-c", uri: "/dynamic/*" }),
        { id: "route-d", uri: "/manual/*" },
      ],
    }));

    expect(plan.creates).toHaveLength(0);
    expect(plan.updates.map(change => change.id)).toEqual(["route-a"]);
    expect(plan.deletes.map(change => change.id)).toEqual(["route-b"]);
    expect(plan.ignored.map(change => [change.id, change.reason])).toEqual([
      ["route-c", "dynamic"],
      ["route-d", "unmanaged"],
    ]);
  });

  it("does not write during dry-run apply", async () => {
    const calls: string[] = [];
    const client = {
      upsert: async () => calls.push("upsert"),
      delete: async () => calls.push("delete"),
    };
    const plan = {
      creates: [{ kind: "routes", id: "route-a", desired: repoObject({ id: "route-a" }) }],
      updates: [{ kind: "routes", id: "route-b", desired: repoObject({ id: "route-b" }) }],
      deletes: [{ kind: "routes", id: "route-c", remote: repoObject({ id: "route-c" }) }],
      ignored: [],
    } as any;

    const result = await applyPlan(client as any, plan, { dryRun: true, prune: true });

    expect(calls).toEqual([]);
    expect(result.applied).toEqual([]);
  });

  it("only prunes repo-managed delete candidates when prune is explicit", async () => {
    const calls: string[] = [];
    const client = {
      upsert: async (_kind: string, id: string) => calls.push(`upsert:${id}`),
      delete: async (_kind: string, id: string) => calls.push(`delete:${id}`),
    };
    const plan = {
      creates: [{ kind: "routes", id: "route-a", desired: repoObject({ id: "route-a" }) }],
      updates: [],
      deletes: [{ kind: "routes", id: "route-b", remote: repoObject({ id: "route-b" }) }],
      ignored: [
        { kind: "routes", id: "route-c", remote: dynamicObject({ id: "route-c" }), reason: "dynamic" },
        { kind: "routes", id: "route-d", remote: { id: "route-d" }, reason: "unmanaged" },
      ],
    } as any;

    await applyPlan(client as any, plan, { dryRun: false, prune: true });

    expect(calls).toEqual(["upsert:route-a", "delete:route-b"]);
  });

  it("does not plan deletes for repo-managed objects outside the selected app scope", () => {
    const desiredRoute = repoObject({ id: "route-a", uri: "/a/*", labels: { env: "prod", app: "tender" } });
    const manifest = createLoadedManifest({
      routes: [desiredRoute],
    }, { env: "prod", app: "tender" });

    const plan = planChanges(manifest, createResourceState({
      routes: [
        repoObject({ id: "route-a", uri: "/a/*", labels: { env: "prod", app: "tender" } }),
        repoObject({ id: "route-b", uri: "/iam/*", labels: { env: "prod", app: "iam" } }),
      ],
    }));

    expect(plan.deletes).toHaveLength(0);
    expect(plan.ignored.map(change => [change.id, change.reason])).toEqual([["route-b", "out_of_scope"]]);
  });
});
