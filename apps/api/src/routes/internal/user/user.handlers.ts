import { getApiAuditRequestContext, getInternalAuditActor } from "@api/services/audit/audit.context";
import type { UserDocumentSearchPort } from "@api/services/user-document-search/user-document-search.port";
import type { RegisterPurveyorContactUseCase } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { getContextValue } from "@iam/api-core/core/request-context";
import { AuthzUnauthorizedError } from "@iam/api-core/errors";
import * as resp from "@iam/api-core/http";
import type { InternalUserDocumentQueryService } from "@iam/user-document";
import { InternalUserDocumentSearchUnavailableError } from "@iam/user-document";
import { UserDocumentSearchUnavailableError } from "@iam/user-document/query";
import type { UserRouteHandler } from "./user.type";
import { runWithinInternalUserHandlerBudget } from "./user-handler-budget";

export { INTERNAL_USER_HANDLER_TIMEOUT_MS } from "./user-handler-budget";

export interface CreateUserHandlersDeps {
  registerPurveyorContact: Pick<RegisterPurveyorContactUseCase, "execute">;
  userDocumentSearch: UserDocumentSearchPort;
  internalUserDocumentQuery: Pick<InternalUserDocumentQueryService, "getDetailByUsername">;
}

export function createUserHandlers(deps: CreateUserHandlersDeps) {
  const userInfo: UserRouteHandler<"userInfo"> = async (c) => {
    const { username } = c.req.valid("param");
    const client = getContextValue<{ clientCode: string }>(c, "clientDto");
    if (!client?.clientCode) throw new AuthzUnauthorizedError();
    const data = await runWithinInternalUserHandlerBudget(
      () => deps.internalUserDocumentQuery.getDetailByUsername(username, client.clientCode),
      () => new InternalUserDocumentSearchUnavailableError(),
    );
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const usersSearchDsl: UserRouteHandler<"usersSearchDsl"> = async (c) => {
    const request = c.req.valid("json");
    const client = getContextValue<{ clientCode: string }>(c, "clientDto");
    if (!client?.clientCode) throw new AuthzUnauthorizedError();
    const data = await runWithinInternalUserHandlerBudget(
      () => deps.userDocumentSearch.searchDsl(request, client.clientCode),
      () => new UserDocumentSearchUnavailableError(),
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
  };
}

export type UserHandlers = ReturnType<typeof createUserHandlers>;
