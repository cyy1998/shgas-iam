export interface ResolveClientDelegationsInput {
  usernames: string[];
  orgCode: string;
  clientId: number;
}

export interface ClientDelegationResolutionQuery extends ResolveClientDelegationsInput {
  observedAt: Date;
}

export type ClientDelegationResolutionResult = {
  username: string;
  delegateeUsername: string | null;
};

export interface ClientDelegationResolutionMissingInputs {
  usernames: string[];
  orgCodes: string[];
}

export type ClientDelegationResolutionIntegrityViolation =
  | {
      category: "ambiguous-delegation";
      username: string;
      delegationIds: number[];
    }
  | {
      category: "self-delegation";
      username: string;
      delegationId: number;
    }
  | {
      category: "invalid-reference";
      username: string;
      delegationId: number;
      relation: "delegatee-user" | "scope-organization";
      referencedIds: number[];
    };

export interface ClientDelegationResolutionObservation {
  results: ClientDelegationResolutionResult[];
  missingInputs: ClientDelegationResolutionMissingInputs;
  integrityViolations: ClientDelegationResolutionIntegrityViolation[];
}
