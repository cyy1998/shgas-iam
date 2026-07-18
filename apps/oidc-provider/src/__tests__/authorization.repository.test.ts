import { describe, expect, it } from "vitest";
import { createOidcAuthorizationRepository } from "../repositories/authorization.repository.ts";

function createQueryResult(rows: readonly unknown[]) {
  const query = {
    from: () => query,
    innerJoin: () => query,
    orderBy: () => query,
    where: () => query,
    then: (
      onFulfilled?: (value: readonly unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected),
  };
  return query;
}

function createAuthorizationDb(results: {
  employments: readonly unknown[];
  organizationPaths: readonly unknown[];
  privileges: readonly unknown[];
}) {
  return {
    select(selection?: Record<string, unknown>) {
      if (selection && "orgOrderNum" in selection)
        return createQueryResult(results.employments);
      if (selection && "descendantId" in selection)
        return createQueryResult(results.organizationPaths);
      if (selection && "privilegeCode" in selection)
        return createQueryResult(results.privileges);
      throw new Error("Unexpected OIDC authorization query");
    },
  };
}

describe("authorization repository for OIDC", () => {
  it("resolves every valid employment for the current client and maps the resulting claim", async () => {
    const resolverInputs: unknown[] = [];
    const repository = createOidcAuthorizationRepository(
      createAuthorizationDb({
        employments: [
          {
            id: 202,
            orgId: 20,
            posId: 200,
            orgCode: "dept-b",
            orgName: "Department B",
            orgType: "department",
            orgOrderNum: 2,
            posCode: "engineer",
            posName: "Engineer",
          },
          {
            id: 101,
            orgId: 10,
            posId: 100,
            orgCode: "dept-a",
            orgName: "Department A",
            orgType: "department",
            orgOrderNum: 1,
            posCode: "manager",
            posName: "Manager",
          },
        ],
        organizationPaths: [
          {
            descendantId: 20,
            depth: 0,
            id: 20,
            orgCode: "dept-b",
            orgName: "Department B",
            orgType: "department",
          },
          {
            descendantId: 10,
            depth: 1,
            id: 1,
            orgCode: "company",
            orgName: "Company",
            orgType: "company",
          },
          {
            descendantId: 10,
            depth: 0,
            id: 10,
            orgCode: "dept-a",
            orgName: "Department A",
            orgType: "department",
          },
        ],
        privileges: [
          { roleId: 2, privilegeCode: "app:read" },
          { roleId: 3, privilegeCode: "app:write" },
        ],
      }) as never,
      {
        resolveEffectiveRoles: async (input) => {
          resolverInputs.push(input);
          return new Map([
            [202, [{ id: 2, roleCode: "app:user" }]],
            [101, [
              { id: 3, roleCode: "app:admin" },
              { id: 2, roleCode: "app:user" },
            ]],
          ]);
        },
      },
    );

    await expect(repository.buildClaim(7, 11)).resolves.toEqual({
      employments: [
        {
          organization: {
            orgCode: "dept-a",
            orgName: "Department A",
            orgType: "department",
            fullOrgPath: [
              { orgCode: "company", orgName: "Company", orgType: "company" },
              { orgCode: "dept-a", orgName: "Department A", orgType: "department" },
            ],
          },
          position: { posCode: "manager", posName: "Manager" },
          roles: ["app:admin", "app:user"],
          privileges: ["app:read", "app:write"],
        },
        {
          organization: {
            orgCode: "dept-b",
            orgName: "Department B",
            orgType: "department",
            fullOrgPath: [
              { orgCode: "dept-b", orgName: "Department B", orgType: "department" },
            ],
          },
          position: { posCode: "engineer", posName: "Engineer" },
          roles: ["app:user"],
          privileges: ["app:read"],
        },
      ],
      roles: ["app:admin", "app:user"],
      privileges: ["app:read", "app:write"],
    });
    expect(resolverInputs).toEqual([{ employmentIds: [202, 101], clientId: 11 }]);
  });
});
