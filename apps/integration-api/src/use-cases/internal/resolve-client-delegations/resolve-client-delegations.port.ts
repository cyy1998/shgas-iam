import type {
  ClientDelegationResolutionObservation,
  ClientDelegationResolutionQuery,
} from "./resolve-client-delegations.type";

export interface ClientDelegationResolutionPort {
  resolveCurrent: (query: ClientDelegationResolutionQuery) => Promise<ClientDelegationResolutionObservation>;
}

export interface ResolveClientDelegationsUseCaseDeps {
  clock: {
    nowDate: () => Date;
  };
  resolution: ClientDelegationResolutionPort;
}
