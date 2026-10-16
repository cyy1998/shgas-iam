import { describe, expect, it } from "bun:test";
import { serializePlan } from "../output";
import { repoObject } from "./test-helpers";

describe("apisix sync JSON output", () => {
  it("serializes unified ignored entries with reasons", () => {
    const output = serializePlan({
      creates: [],
      updates: [],
      deletes: [],
      ignored: [{ kind: "routes", id: "route-a", reason: "dynamic", remote: repoObject({ id: "route-a" }) }],
    });

    expect(output).toEqual({
      creates: [],
      updates: [],
      deletes: [],
      ignored: [{ kind: "routes", id: "route-a", reason: "dynamic" }],
    });
  });
});
