import { runWithinInternalHandlerBudget } from "@api/routes/internal/_handler-budget";
import { getApiAuditRequestContext, getInternalAuditActor } from "@api/services/audit/audit.context";
import {
  PRIVILEGE_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
  PrivilegeDelegationResolutionInputNotFoundError,
  PrivilegeDelegationResolutionUnavailableError,
} from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.error";
import type { ResolvePrivilegeDelegationsUseCase } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.use-case";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { getContextValue } from "@iam/api-core/core/request-context";
import { AuthzUnauthorizedError } from "@iam/api-core/errors";
import * as resp from "@iam/api-core/http";
import type { DelegationService } from "@iam/delegation";
import type { Context } from "hono";
import type { DelegationRouteHandler } from "./delegation.type";

export const PRIVILEGE_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS = 5_000;

export interface CreateDelegationHandlersDeps {
  delegationService: Pick<DelegationService, "create" | "search" | "update">;
  resolvePrivilegeDelegations: Pick<ResolvePrivilegeDelegationsUseCase, "execute">;
}

export function createDelegationHandlers(deps: CreateDelegationHandlersDeps) {
  const privilegeDelegationsResolve: DelegationRouteHandler<"privilegeDelegationsResolve"> = async (c) => {
    const input = c.req.valid("json");
    try {
      const data = await runWithinInternalHandlerBudget(
        () => deps.resolvePrivilegeDelegations.execute({ ...input, clientId: internalClient(c).id }),
        PRIVILEGE_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS,
        () =>
          new PrivilegeDelegationResolutionUnavailableError({
            failureCategory: "handler-timeout",
            context: {
              orgCode: input.orgCode,
              clientId: internalClient(c).id,
              usernameCount: input.usernames.length,
            },
          }),
      );
      return c.json(resp.ok(data), HttpStatusCodes.OK);
    } catch (error) {
      if (error instanceof PrivilegeDelegationResolutionInputNotFoundError) {
        return c.json(
          resp.fail(error.code, PRIVILEGE_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE, error.missingInputs),
          HttpStatusCodes.NOT_FOUND,
        );
      }
      throw error;
    }
  };

  const privilegeDelegationsQuery: DelegationRouteHandler<"privilegeDelegationsQuery"> = async (c) => {
    const query = c.req.valid("json");
    const data = await deps.delegationService.search(query, { kind: "client", clientId: internalClient(c).id });
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const privilegeDelegationUpdate: DelegationRouteHandler<"privilegeDelegationUpdate"> = async (c) => {
    const { id } = c.req.valid("param");
    const dto = c.req.valid("json");
    await deps.delegationService.update(
      id,
      dto,
      { kind: "client", clientId: internalClient(c).id },
      {
        actionPrefix: "internal",
        actor: getInternalAuditActor(c),
        requestContext: getApiAuditRequestContext(c),
      },
    );
    return c.json(resp.ok(true), HttpStatusCodes.OK);
  };

  const privilegeDelegationSet: DelegationRouteHandler<"privilegeDelegationSet"> = async (c) => {
    const dto = c.req.valid("json");
    const data = await deps.delegationService.create(
      dto,
      { kind: "client", clientId: internalClient(c).id },
      {
        actionPrefix: "internal",
        actor: getInternalAuditActor(c),
        requestContext: getApiAuditRequestContext(c),
      },
    );
    return c.json(resp.ok(data.result), HttpStatusCodes.OK);
  };

  return {
    privilegeDelegationsResolve,
    privilegeDelegationSet,
    privilegeDelegationUpdate,
    privilegeDelegationsQuery,
  };
}

export type DelegationHandlers = ReturnType<typeof createDelegationHandlers>;

function internalClient(c: Context) {
  const client = getContextValue<{ id: number; clientCode: string }>(c, "clientDto");
  if (!client || !Number.isInteger(client.id)) throw new AuthzUnauthorizedError();
  return client;
}
