import type { UserService } from "@api/services/user/user.service";
import type { RegisterPurveyorContactUseCase } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import type { InternalUserProfileQueryService } from "@iam/user-profile-read-model";
import type { UserRouteHandler } from "./user.type";
import { getApiAuditRequestContext, getInternalAuditActor } from "@api/services/audit/audit.context";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";
import { InternalUserProfileSearchUnavailableError } from "@iam/user-profile-read-model";

export const INTERNAL_USER_HANDLER_TIMEOUT_MS = 5_000;

export interface CreateUserHandlersDeps {
  registerPurveyorContact: Pick<RegisterPurveyorContactUseCase, "execute">;
  userService: Pick<
    UserService,
    "getUserDetailByUsername" | "searchUsers" | "searchUsersWithPrivilegeDelegation"
  >;
  internalUserProfileQuery: Pick<
    InternalUserProfileQueryService,
    "getDetailByUsername" | "searchDsl"
  >;
}

export function createUserHandlers(deps: CreateUserHandlersDeps) {
  const userInfo: UserRouteHandler<"userInfo"> = async (c) => {
    const { username } = c.req.valid("param");
    const data = await runWithinHandlerBudget(
      deps.internalUserProfileQuery.getDetailByUsername(username),
    );
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const usersSearch: UserRouteHandler<"usersSearch"> = async (c) => {
    const userQueryDto = c.req.valid("json");
    const data = await deps.userService.searchUsers(userQueryDto);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const usersSearchWithPrivilegeDelegation: UserRouteHandler<"usersSearchWithPrivilegeDelegation"> = async (c) => {
    const userQueryDto = c.req.valid("json");
    const data = await deps.userService.searchUsersWithPrivilegeDelegation(userQueryDto);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const usersSearchDsl: UserRouteHandler<"usersSearchDsl"> = async (c) => {
    const request = c.req.valid("json");
    const data = await runWithinHandlerBudget(
      deps.internalUserProfileQuery.searchDsl(request),
    );
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const contactRegister: UserRouteHandler<"contactRegister"> = async (c) => {
    const input = c.req.valid("json");
    const result = await deps.registerPurveyorContact.execute(input, {
      actor: getInternalAuditActor(c),
      requestContext: getApiAuditRequestContext(c),
    });
    return c.json(resp.ok(result), HttpStatusCodes.OK);
  };

  return {
    contactRegister,
    userInfo,
    usersSearchDsl,
    usersSearch,
    usersSearchWithPrivilegeDelegation,
  };
}

export type UserHandlers = ReturnType<typeof createUserHandlers>;

async function runWithinHandlerBudget<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new InternalUserProfileSearchUnavailableError()),
          INTERNAL_USER_HANDLER_TIMEOUT_MS,
        );
      }),
    ]);
  }
  finally {
    if (timeout !== undefined)
      clearTimeout(timeout);
  }
}
