import type { Context } from "hono";
import { createOrganizationAdapter } from "@admin-api/routes/admin/organization/organization.adapter";
import { createPositionAdapter } from "@admin-api/routes/admin/position/position.adapter";
import { createUserAdapter } from "@admin-api/routes/admin/user/user.adapter";
import { OrganizationStatus, PositionStatus } from "@iam/contracts";
import { OrganizationHasEmploymentError } from "@iam/domain/organization";
import { PositionHasEmploymentError } from "@iam/domain/position";
import { UserHasOpenEmploymentError } from "@iam/domain/user";
import { describe, expect, mock, test } from "bun:test";
import { getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

function createCallerContext() {
  const hono = {
    get: mock((key: string) => {
      const authorizationValue = getTestAdminAuthorizationValue(key);
      if (authorizationValue !== undefined)
        return authorizationValue;
      if (key === "userId")
        return 1001;
      if (key === "username")
        return "admin";
      return undefined;
    }),
    req: {
      header: mock(() => undefined),
      method: "PATCH",
      path: "/admin/lifecycle",
    },
  } as unknown as Context;
  return { hono };
}

describe("Open Employment parent lifecycle adapter conflicts", () => {
  test("returns a stable Position conflict that the Admin page can display", async () => {
    const adapter = createPositionAdapter({
      positionService: {
        updatePositionStatus: async () => {
          throw new PositionHasEmploymentError();
        },
      },
    } as any);
    const caller = adapter.positionAdminRouter.createCaller(createCallerContext());

    await expect(caller.updateStatus({
      posCode: "DEV",
      status: PositionStatus.Disable,
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "该岗位存在开放任职，无法停用或删除",
    });
  });

  test("returns a stable Organization conflict that the Admin page can display", async () => {
    const adapter = createOrganizationAdapter({
      organizationService: {
        updateOrganizationStatus: async () => {
          throw new OrganizationHasEmploymentError();
        },
      },
    } as any);
    const caller = adapter.organizationAdminRouter.createCaller(createCallerContext());

    await expect(caller.updateStatus({
      orgCode: "ORG",
      status: OrganizationStatus.Disable,
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "该组织层级内存在开放任职，无法停用或删除",
    });
  });

  test("returns a stable User deletion conflict that the Admin page can display", async () => {
    const adapter = createUserAdapter({
      random: { password: () => "unused" },
      userService: {
        deleteUser: async () => {
          throw new UserHasOpenEmploymentError();
        },
      },
    } as any);
    const caller = adapter.userAdminRouter.createCaller(createCallerContext());

    await expect(caller.delete({ username: "zhangsan" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "该用户存在开放任职，无法删除",
    });
  });
});
