import { runWithinInternalHandlerBudget } from "@api/routes/internal/_handler-budget";
import { getApiAuditRequestContext, getInternalAuditActor } from "@api/services/audit/audit.context";
import {
  CLIENT_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
  ClientDelegationResolutionInputNotFoundError,
  ClientDelegationResolutionUnavailableError,
} from "@api/use-cases/internal/resolve-client-delegations/resolve-client-delegations.error";
import type { ResolveClientDelegationsUseCase } from "@api/use-cases/internal/resolve-client-delegations/resolve-client-delegations.use-case";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { getContextValue } from "@iam/api-core/core/request-context";
import { AuthzUnauthorizedError } from "@iam/api-core/errors";
import * as resp from "@iam/api-core/http";
import type { DelegationService } from "@iam/delegation";
import type { Context } from "hono";
import type { DelegationRouteHandler } from "./delegation.type";

export const CLIENT_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS = 5_000;

export interface CreateDelegationHandlersDeps {
  delegationService: Pick<DelegationService, "create" | "search" | "update">;
  resolveClientDelegations: Pick<ResolveClientDelegationsUseCase, "execute">;
}

export function createDelegationHandlers(deps: CreateDelegationHandlersDeps) {
  const clientDelegationsResolve: DelegationRouteHandler<"clientDelegationsResolve"> = async (c) => {
    const input = c.req.valid("json");
    try {
      const data = await runWithinInternalHandlerBudget(
        () => deps.resolveClientDelegations.execute({ ...input, clientId: internalClient(c).id }),
        CLIENT_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS,
        () =>
          new ClientDelegationResolutionUnavailableError({
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
      if (error instanceof ClientDelegationResolutionInputNotFoundError) {
        return c.json(
          resp.fail(error.code, CLIENT_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE, error.missingInputs),
          HttpStatusCodes.NOT_FOUND,
        );
      }
      throw error;
    }
  };

  const clientDelegationsQuery: DelegationRouteHandler<"clientDelegationsQuery"> = async (c) => {
    const query = c.req.valid("json");
    const data = await deps.delegationService.search(query, { kind: "client", clientId: internalClient(c).id });
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const clientDelegationUpdate: DelegationRouteHandler<"clientDelegationUpdate"> = async (c) => {
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

  const clientDelegationSet: DelegationRouteHandler<"clientDelegationSet"> = async (c) => {
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
    clientDelegationsResolve,
    clientDelegationSet,
    clientDelegationUpdate,
    clientDelegationsQuery,
  };
}

export type DelegationHandlers = ReturnType<typeof createDelegationHandlers>;

function internalClient(c: Context) {
  const client = getContextValue<{ id: number; clientCode: string }>(c, "clientDto");
  if (!client || !Number.isInteger(client.id)) throw new AuthzUnauthorizedError();
  return client;
}
