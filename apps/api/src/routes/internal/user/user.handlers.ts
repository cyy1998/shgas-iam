import type { UserProfileSearchPort } from "@api/services/user-profile-search/user-profile-search.port";
import type { UserDelegationQuery } from "@api/services/user/user-delegation-query.helper";
import type { RegisterPurveyorContactUseCase } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import type { InternalUserProfileQueryService } from "@iam/user-profile-read-model";
import type { UserRouteHandler } from "./user.type";
import { getApiAuditRequestContext, getInternalAuditActor } from "@api/services/audit/audit.context";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";
import { InternalUserProfileSearchUnavailableError } from "@iam/user-profile-read-model";
import { V3UserProfileSearchUnavailableError } from "@iam/user-profile-read-model/v3";
import { runWithinInternalUserHandlerBudget } from "./user-handler-budget";

export { INTERNAL_USER_HANDLER_TIMEOUT_MS } from "./user-handler-budget";

export interface CreateUserHandlersDeps {
  registerPurveyorContact: Pick<RegisterPurveyorContactUseCase, "execute">;
  userDelegationQuery: Pick<UserDelegationQuery, "searchUsersWithDelegations">;
  userProfileSearch: UserProfileSearchPort;
  internalUserProfileQuery: Pick<
    InternalUserProfileQueryService,
    "getDetailByUsername"
  >;
}

export function createUserHandlers(deps: CreateUserHandlersDeps) {
  const userInfo: UserRouteHandler<"userInfo"> = async (c) => {
    const { username } = c.req.valid("param");
    const data = await runWithinInternalUserHandlerBudget(
      () => deps.internalUserProfileQuery.getDetailByUsername(username),
      () => new InternalUserProfileSearchUnavailableError(),
    );
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const usersSearch: UserRouteHandler<"usersSearch"> = async (c) => {
    const userQueryDto = c.req.valid("json");
    const data = await deps.userProfileSearch.searchLegacyUsers(userQueryDto);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const usersSearchWithPrivilegeDelegation: UserRouteHandler<"usersSearchWithPrivilegeDelegation"> = async (c) => {
    const userQueryDto = c.req.valid("json");
    const data = await deps.userDelegationQuery.searchUsersWithDelegations(userQueryDto);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const usersSearchDsl: UserRouteHandler<"usersSearchDsl"> = async (c) => {
    const request = c.req.valid("json");
    const data = await runWithinInternalUserHandlerBudget(
      () => deps.userProfileSearch.searchDsl(request),
      () => new V3UserProfileSearchUnavailableError(),
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
