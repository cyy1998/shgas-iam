import type { RelationsHelper } from "../../types";
import { describe, expect, test } from "bun:test";
import { employmentsRelations } from "../employments";

function relationStub(kind: "one" | "many", tableName: string) {
  return (options?: unknown) => ({ kind, tableName, options });
}

const r = {
  one: new Proxy({}, {
    get: (_target, property) => relationStub("one", String(property)),
  }),
  many: new Proxy({}, {
    get: (_target, property) => relationStub("many", String(property)),
  }),
  employments: {
    id: "employments.id",
    userId: "employments.userId",
    orgId: "employments.orgId",
    posId: "employments.posId",
  },
  users: {
    id: "users.id",
  },
  organizations: {
    id: "organizations.id",
  },
  positions: {
    id: "positions.id",
  },
  employmentRoles: {
    employmentId: "employmentRoles.employmentId",
  },
} as unknown as RelationsHelper;

describe("employmentsRelations", () => {
  test("exposes the department relation with the corrected spelling", () => {
    const relationNames = Object.keys(employmentsRelations(r).employments);
    const previousMisspelling = ["dept", "artment"].join("");

    expect(relationNames).toContain("department");
    expect(relationNames).not.toContain("company");
    expect(relationNames).not.toContain(previousMisspelling);
  });
});
