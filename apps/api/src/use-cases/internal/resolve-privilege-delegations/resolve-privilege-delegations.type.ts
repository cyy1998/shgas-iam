export interface ResolvePrivilegeDelegationsInput {
  usernames: string[];
  orgCode: string;
  privilegeCode: string;
}

export interface PrivilegeDelegationResolutionQuery
  extends ResolvePrivilegeDelegationsInput {
  observedAt: Date;
}

export type PrivilegeDelegationResolutionResult = {
  username: string;
  delegateeUsername: string | null;
};

export interface PrivilegeDelegationResolutionMissingInputs {
  usernames: string[];
  orgCodes: string[];
  privilegeCodes: string[];
}

export type PrivilegeDelegationResolutionIntegrityViolation
  = | {
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
    relation: "delegatee-user" | "scope-organization" | "privilege";
    referencedIds: number[];
  };

export interface PrivilegeDelegationResolutionObservation {
  results: PrivilegeDelegationResolutionResult[];
  missingInputs: PrivilegeDelegationResolutionMissingInputs;
  integrityViolations: PrivilegeDelegationResolutionIntegrityViolation[];
}
