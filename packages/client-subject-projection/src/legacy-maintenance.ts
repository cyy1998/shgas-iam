export {
  parseSubjectClaimSelection,
  SUBJECT_CLAIM_CATALOG_V1,
} from "./catalog";
export { SubjectProjectionNotReadyError } from "./errors";
export { createClientSubjectProjectionService } from "./internal/client-subject-projection";
export { InvalidSubjectClaimSelectionError } from "./subject-claim-selection.error";

export type OptionalSubjectClaim
  = | "profile:username"
    | "profile:name"
    | "profile:phone"
    | "profile:employments"
    | "iam:authorization";

export interface SubjectClaimSelection {
  readonly catalogVersion: 1;
  readonly optionalClaims: readonly OptionalSubjectClaim[];
}

export interface ResolveClientSubjectInput {
  readonly subjectIdentifier: string;
  readonly clientCode: string;
  readonly selection: SubjectClaimSelection;
}

export interface SubjectOrganization {
  readonly code: string;
  readonly name: string;
  readonly type: string;
}

export interface SubjectOrganizationWithPath extends SubjectOrganization {
  readonly path: readonly SubjectOrganization[];
}

export interface SubjectPosition {
  readonly code: string;
  readonly name: string;
}

export interface SubjectFactsRole {
  readonly code: string;
  readonly privileges: readonly string[];
}

export interface SubjectFactsClientAuthorization {
  readonly clientCode: string;
  readonly roles: readonly SubjectFactsRole[];
}

export interface SubjectFactsEmployment {
  readonly isPrimary: boolean;
  readonly organization: SubjectOrganizationWithPath;
  readonly position: SubjectPosition;
  readonly clientAuthorizations: readonly SubjectFactsClientAuthorization[];
}

export interface SubjectFactsSnapshot {
  readonly subjectIdentifier: string;
  readonly sourceDirtyVersion: string;
  readonly profile: {
    readonly username: string;
    readonly name: string;
    readonly phone: string | null;
  };
  readonly employments: readonly SubjectFactsEmployment[];
}

export interface EmploymentProfile {
  readonly isPrimary: boolean;
  readonly organization: SubjectOrganizationWithPath;
  readonly position: SubjectPosition;
}

export interface ClientAuthorizationEmployment extends EmploymentProfile {
  readonly roles: readonly string[];
  readonly privileges: readonly string[];
}

export interface ClientAuthorization {
  readonly employments: readonly ClientAuthorizationEmployment[];
  readonly roles: readonly string[];
  readonly privileges: readonly string[];
}

export interface ClientSubjectProjection {
  readonly subjectIdentifier: string;
  readonly username?: string;
  readonly name?: string;
  readonly phone?: string | null;
  readonly employments?: readonly EmploymentProfile[];
  readonly authorization?: ClientAuthorization;
}

export interface SubjectAccessPort {
  readonly assertAccessible: (subjectIdentifier: string) => Promise<void>;
}

export interface SubjectFactsPort {
  readonly read: (subjectIdentifier: string) => Promise<SubjectFactsSnapshot | null>;
}

export type AuthorizationFreshnessCheckResult
  = | { readonly status: "fresh" }
    | { readonly status: "refreshed"; readonly facts: SubjectFactsSnapshot }
    | { readonly status: "not-ready" };

export interface AuthorizationFreshnessPort {
  readonly check: (input: {
    readonly subjectIdentifier: string;
    readonly sourceDirtyVersion: string;
  }) => Promise<AuthorizationFreshnessCheckResult>;
}

export interface ClientSubjectProjectionService {
  readonly resolve: (input: ResolveClientSubjectInput) => Promise<ClientSubjectProjection>;
}

export interface CreateClientSubjectProjectionServiceOptions {
  readonly subjectAccess: SubjectAccessPort;
  readonly subjectFacts: SubjectFactsPort;
  readonly authorizationFreshness: AuthorizationFreshnessPort;
}
