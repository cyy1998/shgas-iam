import { describe, expect, it } from "vitest";
import {
  assembleOidcAuthorizationClaim,
  buildOidcAuthorizationEmployment,
} from "../provider/authorization-claim.ts";

describe("iam:authorization claim", () => {
  it("maps Effective Roles and derives their privileges", () => {
    const employment = buildOidcAuthorizationEmployment({
      orderNum: 2,
      organization: {
        orgCode: "dept-b",
        orgName: "Department B",
        orgType: "department",
        fullOrgPath: [
          { orgCode: "company", orgName: "Company", orgType: "company" },
          { orgCode: "dept-b", orgName: "Department B", orgType: "department" },
        ],
      },
      position: { posCode: "engineer", posName: "Engineer" },
      effectiveRoles: [
        { id: 1, roleCode: "app:user" },
        { id: 2, roleCode: "app:admin" },
      ],
    }, new Map([
      [1, ["app:read"]],
      [2, ["app:write", "app:read"]],
    ]));

    expect(employment.roles).toEqual(["app:admin", "app:user"]);
    expect(employment.privileges).toEqual(["app:read", "app:write"]);
  });

  it("keeps all employments, strips ordering metadata, and produces stable aggregate codes", () => {
    const claim = assembleOidcAuthorizationClaim([
      {
        orderNum: 2,
        organization: {
          orgCode: "dept-b",
          orgName: "Department B",
          orgType: "department",
          fullOrgPath: [],
        },
        position: { posCode: "z", posName: "Z" },
        roles: [],
        privileges: [],
      },
      {
        orderNum: 1,
        organization: {
          orgCode: "dept-a",
          orgName: "Department A",
          orgType: "department",
          fullOrgPath: [],
        },
        position: { posCode: "a", posName: "A" },
        roles: ["app:user", "app:admin"],
        privileges: ["app:write", "app:read"],
      },
    ]);

    expect(claim.employments.map(item => item.organization.orgCode)).toEqual(["dept-a", "dept-b"]);
    expect(claim.roles).toEqual(["app:admin", "app:user"]);
    expect(claim.privileges).toEqual(["app:read", "app:write"]);
    expect(claim.employments[1]).toMatchObject({ roles: [], privileges: [] });
    expect(claim.employments[0]).not.toHaveProperty("orderNum");
  });
});
