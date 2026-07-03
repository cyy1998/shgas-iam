import { RoleAssignmentTargetType } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import * as clientAudit from "../events/client.audit";
import * as employmentAudit from "../events/employment.audit";
import * as roleAudit from "../events/role.audit";
import * as userAudit from "../events/user.audit";

describe("admin audit event builders", () => {
  test("builds user mutation payload with masked target mobile and patch mobile", () => {
    expect(userAudit.buildAdminUserAudit(
      "admin.user.update",
      { id: 1001, username: "zhangsan", name: "张三", mobile: "17721462865" },
      { patch: { mobile: "17700001111" } },
      { actorType: "admin", actorUsername: "admin" },
    )).toMatchObject({
      action: "admin.user.update",
      actorType: "admin",
      actorUsername: "admin",
      targetType: "user",
      targetCode: "zhangsan",
      details: expect.objectContaining({
        targetMobile: "177****2865",
        patch: { mobile: "177****1111" },
      }),
    });
  });

  test("builds client mutation payload without leaking client secret patch values", () => {
    expect(clientAudit.buildAdminClientAudit(
      "admin.client.rotate_secret",
      { id: 2001, clientCode: "portal", clientName: "门户", clientSecret: "secret", status: 1 } as never,
      { patch: { clientSecretRotated: true } },
    )).toMatchObject({
      action: "admin.client.rotate_secret",
      targetType: "client",
      targetCode: "portal",
      details: expect.objectContaining({
        clientCode: "portal",
        patch: { clientSecretRotated: true },
      }),
    });
  });

  test("builds employment resignation as a user target", () => {
    expect(employmentAudit.buildEmploymentResignUserAudit(
      { id: 1001, username: "zhangsan", name: "张三" },
      { actorType: "system", actorSystemKey: "admin-api" },
    )).toMatchObject({
      action: "admin.employment.resign_user",
      targetType: "user",
      targetId: 1001,
      targetCode: "zhangsan",
      details: {
        username: "zhangsan",
        resigned: true,
      },
    });
  });

  test("builds role assignment payload with role target and assignment summary", () => {
    expect(roleAudit.buildRoleAssignmentAudit(
      "admin.role.assignment.create",
      { id: 1, roleCode: "portal-admin", roleName: "Portal Admin", status: 1 },
      {
        id: 100,
        targetType: RoleAssignmentTargetType.Organization,
        targetId: 20,
        includeDescendants: true,
        target: { code: "ORG", name: "Org", status: 1 },
      },
      { created: true },
      { actorType: "admin", actorUsername: "admin" },
    )).toMatchObject({
      action: "admin.role.assignment.create",
      targetType: "role",
      targetCode: "portal-admin",
      details: {
        roleCode: "portal-admin",
        roleName: "Portal Admin",
        status: 1,
        assignment: {
          id: 100,
          targetType: "organization",
          targetId: 20,
          targetCode: "ORG",
          targetName: "Org",
          targetStatus: 1,
          includeDescendants: true,
        },
        created: true,
      },
    });
  });
});
