import type { PublicRouteHandler } from "./public.types";
import { organizationService } from "@services/organization.service";
import { userService } from "@services/user.common.service";
import { getCookie } from "hono/cookie";
import * as sessionService from "@/services/session/session.service";
import * as resp from "@/utils/http/response";

export const userInfo: PublicRouteHandler<"userInfo"> = async (c) => {
  const data = c.get("userDetailDto");
  return c.json(resp.ok(data));
};

export const passwordChange: PublicRouteHandler<"passwordChange"> = async (c) => {
  const { oldPassword, newPassword } = c.req.valid("json");
  const data = await userService.setPassword(c.get("username"), oldPassword, newPassword);
  return c.json(resp.ok(data));
};

export const mobileSet: PublicRouteHandler<"mobileSet"> = async (c) => {
  const { phoneNumber, code } = c.req.valid("json");
  const sessionId = getCookie(c, "global_session") ?? c.req.header("Authorization") ?? "";
  const newUserDto = await userService.setMobile(c.get("userId"), phoneNumber, code);
  const data = await sessionService.updateSession(sessionId, JSON.stringify(newUserDto));
  return c.json(resp.ok(data));
};

export const organizationsSearch: PublicRouteHandler<"organizationsSearch"> = async (c) => {
  const organizationQueryDto = c.req.valid("json");
  const data = await organizationService.searchOrganizations(organizationQueryDto);
  return c.json(resp.ok(data));
};

export const usersSearch: PublicRouteHandler<"usersSearch"> = async (c) => {
  const userQueryDto = c.req.valid("json");
  const data = await userService.searchUsers(userQueryDto);
  return c.json(resp.ok(data));
};

export const usersQueryByOrg: PublicRouteHandler<"usersQueryByOrg"> = async (c) => {
  const { orgCode } = c.req.valid("query");
  const data = await userService.getUsersByOrg(orgCode, "direct");
  return c.json(resp.ok(data));
};
