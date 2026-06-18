import type { OrganizationService } from "@api/services/organization/organization.service";
import type { SessionService } from "@api/services/session/session.service";
import type { UserService } from "@api/services/user/user.service";
import type { PublicRouteHandler } from "./public.type";
import * as resp from "@iam/api-core/http";
import { getCookie } from "hono/cookie";

export interface CreatePublicHandlersDeps {
  organizationService: Pick<OrganizationService, "searchOrganizations">;
  sessionService: Pick<SessionService, "updateSession">;
  userService: Pick<UserService, "searchUsers" | "setMobile" | "setPassword">;
}

export function createPublicHandlers(deps: CreatePublicHandlersDeps) {
  const userInfo: PublicRouteHandler<"userInfo"> = async (c) => {
    const data = c.get("userDetailDto");
    return c.json(resp.ok(data));
  };

  const passwordChange: PublicRouteHandler<"passwordChange"> = async (c) => {
    const { oldPassword, newPassword } = c.req.valid("json");
    const data = await deps.userService.setPassword(c.get("username"), oldPassword, newPassword);
    return c.json(resp.ok(data));
  };

  const mobileSet: PublicRouteHandler<"mobileSet"> = async (c) => {
    const { phoneNumber, code } = c.req.valid("json");
    const sessionId = getCookie(c, "global_session") ?? c.req.header("Authorization") ?? "";
    const newUserDto = await deps.userService.setMobile(c.get("userId"), phoneNumber, code);
    const data = await deps.sessionService.updateSession(sessionId, newUserDto);
    return c.json(resp.ok(data));
  };

  const organizationsSearch: PublicRouteHandler<"organizationsSearch"> = async (c) => {
    const organizationQueryDto = c.req.valid("json");
    const data = await deps.organizationService.searchOrganizations(organizationQueryDto);
    return c.json(resp.ok(data));
  };

  const usersSearch: PublicRouteHandler<"usersSearch"> = async (c) => {
    const userQueryDto = c.req.valid("json");
    const data = await deps.userService.searchUsers(userQueryDto);
    return c.json(resp.ok(data));
  };

  return {
    mobileSet,
    organizationsSearch,
    passwordChange,
    userInfo,
    usersSearch,
  };
}

export type PublicHandlers = ReturnType<typeof createPublicHandlers>;
