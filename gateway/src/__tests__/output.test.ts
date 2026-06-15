import { describe, expect, it } from "bun:test";
import { serializeApplyResult, serializePlan } from "../output";
import { repoObject } from "./test-helpers";

describe("apisix sync JSON output", () => {
  it("serializes unified ignored entries with reasons", () => {
    const output = serializePlan({
      creates: [],
      updates: [],
      deletes: [],
      ignored: [
        { kind: "routes", id: "route-a", reason: "dynamic", remote: repoObject({ id: "route-a" }) },
      ],
    });

    expect(output).toEqual({
      creates: [],
      updates: [],
      deletes: [],
      ignored: [{ kind: "routes", id: "route-a", reason: "dynamic" }],
    });
    expect(output).not.toHaveProperty("ignoredDynamic");
    expect(output).not.toHaveProperty("ignoredOutOfScope");
    expect(output).not.toHaveProperty("ignoredUnmanaged");
  });

  it("serializes unified applied entries with actions", () => {
    const output = serializeApplyResult({
      plan: {
        creates: [],
        updates: [],
        deletes: [],
        ignored: [],
      },
      dryRun: false,
      prune: true,
      applied: [
        { kind: "routes", id: "route-a", action: "create", desired: repoObject({ id: "route-a" }) },
      ],
    });

    expect(output.applied).toEqual([{ kind: "routes", id: "route-a", action: "create" }]);
  });

  it("serializes dry-run apply with no applied actions", () => {
    const output = serializeApplyResult({
      plan: {
        creates: [{ kind: "routes", id: "route-a", desired: repoObject({ id: "route-a" }) }],
        updates: [],
        deletes: [],
        ignored: [],
      },
      dryRun: true,
      prune: true,
      applied: [],
    });

    expect(output).toMatchObject({
      dryRun: true,
      applied: [],
    });
  });
});
