import type { PrivilegeDelegationService } from "@api/services/privilege/privilegeDelegation.service";
import type { ResolvePrivilegeDelegationsUseCase } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.use-case";
import type { DelegationRouteHandler } from "./delegation.type";
import { runWithinInternalHandlerBudget } from "@api/routes/internal/_handler-budget";
import { getApiAuditRequestContext, getInternalAuditActor } from "@api/services/audit/audit.context";
import {
  PRIVILEGE_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
  PrivilegeDelegationResolutionInputNotFoundError,
  PrivilegeDelegationResolutionUnavailableError,
} from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.error";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";

export const PRIVILEGE_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS = 5_000;

export interface CreateDelegationHandlersDeps {
  privilegeDelegationService: Pick<
    PrivilegeDelegationService,
    "createPrivilegeDelegation" | "queryPrivilegeDelegations" | "updateDelegation"
  >;
  resolvePrivilegeDelegations: Pick<ResolvePrivilegeDelegationsUseCase, "execute">;
}

export function createDelegationHandlers(deps: CreateDelegationHandlersDeps) {
  const privilegeDelegationsResolve: DelegationRouteHandler<"privilegeDelegationsResolve"> = async (c) => {
    const input = c.req.valid("json");
    try {
      const data = await runWithinInternalHandlerBudget(
        () => deps.resolvePrivilegeDelegations.execute(input),
        PRIVILEGE_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS,
        () => new PrivilegeDelegationResolutionUnavailableError({
          failureCategory: "handler-timeout",
          context: {
            orgCode: input.orgCode,
            privilegeCode: input.privilegeCode,
            usernameCount: input.usernames.length,
          },
        }),
      );
      return c.json(resp.ok(data), HttpStatusCodes.OK);
    }
    catch (error) {
      if (error instanceof PrivilegeDelegationResolutionInputNotFoundError) {
        return c.json(
          resp.fail(
            error.code,
            PRIVILEGE_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
            error.missingInputs,
          ),
          HttpStatusCodes.NOT_FOUND,
        );
      }
      throw error;
    }
  };

  const privilegeDelegationsQuery: DelegationRouteHandler<"privilegeDelegationsQuery"> = async (c) => {
    const query = c.req.valid("json");
    const data = await deps.privilegeDelegationService.queryPrivilegeDelegations(query);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const privilegeDelegationUpdate: DelegationRouteHandler<"privilegeDelegationUpdate"> = async (c) => {
    const { id } = c.req.valid("param");
    const dto = c.req.valid("json");
    const data = await deps.privilegeDelegationService.updateDelegation(id, dto, {
      actor: getInternalAuditActor(c),
      requestContext: getApiAuditRequestContext(c),
    });
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const privilegeDelegationSet: DelegationRouteHandler<"privilegeDelegationSet"> = async (c) => {
    const dto = c.req.valid("json");
    const data = await deps.privilegeDelegationService.createPrivilegeDelegation(dto, {
      actor: getInternalAuditActor(c),
      requestContext: getApiAuditRequestContext(c),
    });
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  return {
    privilegeDelegationsResolve,
    privilegeDelegationSet,
    privilegeDelegationUpdate,
    privilegeDelegationsQuery,
  };
}

export type DelegationHandlers = ReturnType<typeof createDelegationHandlers>;
