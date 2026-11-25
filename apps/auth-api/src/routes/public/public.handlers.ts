import { getApiAuditRequestContext } from "@auth-api/services/audit/audit.context";
import type { UserService } from "@auth-api/services/user/user.service";
import * as resp from "@iam/api-core/http";
import { HttpStatusCodes } from "@iam/contracts/http";
import { AuthzUnauthorizedError } from "@iam/runtime/errors";
import type { PublicRouteHandler } from "./public.type";

export interface CreatePublicHandlersDeps {
  userService: Pick<UserService, "getActiveUserBySubjectIdentifier" | "setMobile" | "setPassword">;
}

export function createPublicHandlers(deps: CreatePublicHandlersDeps) {
  async function resolveAccount(subjectIdentifier: string) {
    const account = await deps.userService.getActiveUserBySubjectIdentifier(subjectIdentifier);
    if (account === null) {
      throw new AuthzUnauthorizedError("未登录");
    }
    return account;
  }

  const passwordChange: PublicRouteHandler<"passwordChange"> = async (c) => {
    const { oldPassword, newPassword } = c.req.valid("json");
    const account = await resolveAccount(c.get("subjectIdentifier"));
    const data = await deps.userService.setPassword(account.username, oldPassword, newPassword, {
      requestContext: getApiAuditRequestContext(c),
    });
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const mobileSet: PublicRouteHandler<"mobileSet"> = async (c) => {
    const { phoneNumber, code } = c.req.valid("json");
    const account = await resolveAccount(c.get("subjectIdentifier"));
    await deps.userService.setMobile(account.id, phoneNumber, code, {
      requestContext: getApiAuditRequestContext(c),
    });
    return c.json(resp.ok(true), HttpStatusCodes.OK);
  };

  return {
    mobileSet,
    passwordChange,
  };
}
