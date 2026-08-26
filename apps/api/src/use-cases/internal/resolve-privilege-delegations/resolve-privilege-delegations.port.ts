import type {
  PrivilegeDelegationResolutionObservation,
  PrivilegeDelegationResolutionQuery,
} from "./resolve-privilege-delegations.type";

export interface PrivilegeDelegationResolutionPort {
  resolveCurrent: (
    query: PrivilegeDelegationResolutionQuery,
  ) => Promise<PrivilegeDelegationResolutionObservation>;
}

export interface ResolvePrivilegeDelegationsUseCaseDeps {
  clock: {
    nowDate: () => Date;
  };
  resolution: PrivilegeDelegationResolutionPort;
}
