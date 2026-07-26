import type { OrganizationService } from "@api/services/organization/organization.service";
import type { UserService } from "@api/services/user/user.service";
import type { PublicRouteHandler } from "./public.type";
import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";

export interface CreatePublicHandlersDeps {
  organizationService: Pick<OrganizationService, "searchOrganizations">;
  userService: Pick<UserService, "searchUsers" | "setMobile" | "setPassword">;
}

export function createPublicHandlers(deps: CreatePublicHandlersDeps) {
  const userInfo: PublicRouteHandler<"userInfo"> = async (c) => {
    const data = c.get("userDetailDto");
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const orcasId: PublicRouteHandler<"orcasId"> = async (c) => {
    return c.json(resp.ok({ orcasId: c.get("customSsoSessionOrcasId") ?? null }), HttpStatusCodes.OK);
  };

  const passwordChange: PublicRouteHandler<"passwordChange"> = async (c) => {
    const { oldPassword, newPassword } = c.req.valid("json");
    const data = await deps.userService.setPassword(c.get("username"), oldPassword, newPassword, {
      requestContext: getApiAuditRequestContext(c),
    });
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const mobileSet: PublicRouteHandler<"mobileSet"> = async (c) => {
    const { phoneNumber, code } = c.req.valid("json");
    await deps.userService.setMobile(c.get("userId"), phoneNumber, code, {
      requestContext: getApiAuditRequestContext(c),
    });
    return c.json(resp.ok(true), HttpStatusCodes.OK);
  };

  const organizationsSearch: PublicRouteHandler<"organizationsSearch"> = async (c) => {
    const organizationQueryDto = c.req.valid("json");
    const data = await deps.organizationService.searchOrganizations(organizationQueryDto);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const usersSearch: PublicRouteHandler<"usersSearch"> = async (c) => {
    const userQueryDto = c.req.valid("json");
    const data = await deps.userService.searchUsers(userQueryDto);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  return {
    mobileSet,
    orcasId,
    organizationsSearch,
    passwordChange,
    userInfo,
    usersSearch,
  };
}

export type PublicHandlers = ReturnType<typeof createPublicHandlers>;
