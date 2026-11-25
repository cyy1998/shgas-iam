import {
  ClientDelegationResolutionInputNotFoundError,
  ClientDelegationResolutionUnavailableError,
} from "./resolve-client-delegations.error";
import type { ResolveClientDelegationsUseCaseDeps } from "./resolve-client-delegations.port";
import type {
  ClientDelegationResolutionMissingInputs,
  ClientDelegationResolutionResult,
  ResolveClientDelegationsInput,
} from "./resolve-client-delegations.type";

function hasMissingInputs(input: ClientDelegationResolutionMissingInputs) {
  return input.usernames.length > 0 || input.orgCodes.length > 0;
}

export function createResolveClientDelegationsUseCase(deps: ResolveClientDelegationsUseCaseDeps) {
  async function execute(input: ResolveClientDelegationsInput): Promise<ClientDelegationResolutionResult[]> {
    const observedAt = deps.clock.nowDate();
    let observation: Awaited<ReturnType<typeof deps.resolution.resolveCurrent>>;
    try {
      observation = await deps.resolution.resolveCurrent({
        ...input,
        observedAt,
      });
    } catch (error) {
      throw new ClientDelegationResolutionUnavailableError(
        {
          failureCategory: isStatementTimeout(error) ? "statement-timeout" : "persistence-failure",
          context: {
            orgCode: input.orgCode,
            clientId: input.clientId,
            usernameCount: input.usernames.length,
          },
        },
        error,
      );
    }
    if (hasMissingInputs(observation.missingInputs)) {
      throw new ClientDelegationResolutionInputNotFoundError(observation.missingInputs);
    }
    if (observation.integrityViolations.length > 0) {
      throw new ClientDelegationResolutionUnavailableError({
        failureCategory: "integrity-violation",
        violations: observation.integrityViolations,
      });
    }
    return observation.results;
  }

  return { execute };
}

function isStatementTimeout(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "57014";
}

export type ResolveClientDelegationsUseCase = ReturnType<typeof createResolveClientDelegationsUseCase>;
