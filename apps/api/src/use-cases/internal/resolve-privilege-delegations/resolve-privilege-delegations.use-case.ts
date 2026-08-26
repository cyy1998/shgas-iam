import type { ResolvePrivilegeDelegationsUseCaseDeps } from "./resolve-privilege-delegations.port";
import type {
  PrivilegeDelegationResolutionMissingInputs,
  PrivilegeDelegationResolutionResult,
  ResolvePrivilegeDelegationsInput,
} from "./resolve-privilege-delegations.type";
import {
  PrivilegeDelegationResolutionInputNotFoundError,
  PrivilegeDelegationResolutionUnavailableError,
} from "./resolve-privilege-delegations.error";

function hasMissingInputs(input: PrivilegeDelegationResolutionMissingInputs) {
  return input.usernames.length > 0
    || input.orgCodes.length > 0
    || input.privilegeCodes.length > 0;
}

export function createResolvePrivilegeDelegationsUseCase(
  deps: ResolvePrivilegeDelegationsUseCaseDeps,
) {
  async function execute(
    input: ResolvePrivilegeDelegationsInput,
  ): Promise<PrivilegeDelegationResolutionResult[]> {
    const observedAt = deps.clock.nowDate();
    let observation;
    try {
      observation = await deps.resolution.resolveCurrent({
        ...input,
        observedAt,
      });
    }
    catch (error) {
      throw new PrivilegeDelegationResolutionUnavailableError({
        failureCategory: isStatementTimeout(error)
          ? "statement-timeout"
          : "persistence-failure",
        context: {
          orgCode: input.orgCode,
          privilegeCode: input.privilegeCode,
          usernameCount: input.usernames.length,
        },
      }, error);
    }
    if (hasMissingInputs(observation.missingInputs)) {
      throw new PrivilegeDelegationResolutionInputNotFoundError(
        observation.missingInputs,
      );
    }
    if (observation.integrityViolations.length > 0) {
      throw new PrivilegeDelegationResolutionUnavailableError({
        failureCategory: "integrity-violation",
        violations: observation.integrityViolations,
      });
    }
    return observation.results;
  }

  return { execute };
}

function isStatementTimeout(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "57014";
}

export type ResolvePrivilegeDelegationsUseCase = ReturnType<
  typeof createResolvePrivilegeDelegationsUseCase
>;
