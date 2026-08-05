import type { DbClient } from "@iam/db";
import { describe, expect, test } from "bun:test";
import { createRoleAssignmentResolver } from "../../src/index.ts";

function createInaccessibleDb(): DbClient {
  return new Proxy({}, {
    get() {
      throw new Error("empty input must not access the database");
    },
  }) as DbClient;
}

describe("role assignment resolver", () => {
  test("returns an empty employment map without querying for empty input", async () => {
    const resolver = createRoleAssignmentResolver(createInaccessibleDb());

    const result = await resolver.resolveEffectiveRoles({ employmentIds: [] });

    expect(result).toEqual(new Map());
  });

  test("returns no affected users without querying for empty input", async () => {
    const resolver = createRoleAssignmentResolver(createInaccessibleDb());

    const result = await resolver.resolveAffectedUserIds({ roleIds: [] });

    expect(result).toEqual([]);
  });
});
