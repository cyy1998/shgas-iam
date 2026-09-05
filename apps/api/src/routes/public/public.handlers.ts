import type { OrganizationService } from "@api/services/organization/organization.service";
import type {
  CustomSsoSubjectProjectionV2Dto,
} from "@api/services/sso/transport/custom-sso-subject.schema";
import type { UserProfileSearchPort } from "@api/services/user-profile-search/user-profile-search.port";
import type { UserService } from "@api/services/user/user.service";
import type { PublicRouteHandler } from "./public.type";
import {
  mapCustomSsoRetryableError,
} from "@api/middlewares/custom-sso-retryable.error";
import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import * as resp from "@iam/api-core/http";

export interface CreatePublicHandlersDeps {
  organizationService: Pick<OrganizationService, "searchOrganizations">;
  subjectDeliveryRequests: {
    resolveUserInfoForRequest: (
      request: object,
    ) => Promise<CustomSsoSubjectProjectionV2Dto>;
  };
  userService: Pick<
    UserService,
    | "getActiveUserBySubjectIdentifier"
    | "getUserDetailById"
    | "setMobile"
    | "setPassword"
  >;
  userProfileSearch: Pick<UserProfileSearchPort, "searchLegacyUsers">;
  config: {
    projectionRetryAfterSeconds: number;
  };
}

export function createPublicHandlers(deps: CreatePublicHandlersDeps) {
  async function resolveAccount(subjectIdentifier: string) {
    const account = await deps.userService.getActiveUserBySubjectIdentifier(subjectIdentifier);
    if (account === null) {
      throw new AuthzUnauthorizedError("未登录");
    }
    return account;
  }

  const userInfo: PublicRouteHandler<"userInfo"> = async (c) => {
    try {
      const data
        = await deps.subjectDeliveryRequests.resolveUserInfoForRequest(c);
      return c.json(resp.ok(data), HttpStatusCodes.OK);
    }
    catch (error) {
      throw mapCustomSsoRetryableError(error, {
        retryAfterSeconds: deps.config.projectionRetryAfterSeconds,
      });
    }
  };

  const orcasId: PublicRouteHandler<"orcasId"> = async (c) => {
    return c.json(resp.ok({ orcasId: c.get("orcasId") ?? null }), HttpStatusCodes.OK);
  };

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

  const organizationsSearch: PublicRouteHandler<"organizationsSearch"> = async (c) => {
    const organizationQueryDto = c.req.valid("json");
    const data = await deps.organizationService.searchOrganizations(organizationQueryDto);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const usersSearch: PublicRouteHandler<"usersSearch"> = async (c) => {
    const userQueryDto = c.req.valid("json");
    const data = await deps.userProfileSearch.searchLegacyUsers(userQueryDto);
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
