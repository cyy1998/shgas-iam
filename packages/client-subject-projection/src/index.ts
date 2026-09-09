export { SubjectProjectionNotReadyError } from "./errors";
export {
  parseSubjectClaimSelection,
  SUBJECT_CLAIM_CATALOG,
} from "./internal/catalog";
export { EmploymentResponsibilitySnapshotSchema } from "./internal/contract";
export type {
  ClientAuthorization,
  ClientAuthorizationEmployment,
  ClientSubjectProjection,
  ClientSubjectProjectionService,
  EmploymentProfile,
  EmploymentResponsibilitySnapshot,
  PermittedClientSubjectProjectionService,
  ResolveClientSubjectInput,
  SubjectClaimSelection,
  SubjectFactsEmployment,
  SubjectFactsSnapshot,
} from "./internal/contract";
export {
  createPermittedClientSubjectProjectionService,
} from "./internal/projection";
export { InvalidSubjectClaimSelectionError } from "./subject-claim-selection.error";

export type OptionalSubjectClaim
  = | "profile:username"
    | "profile:name"
    | "profile:phone"
    | "profile:employments"
    | "iam:authorization";

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

export interface SubjectFactsEmploymentBase {
  readonly isPrimary: boolean;
  readonly organization: SubjectOrganizationWithPath;
  readonly position: SubjectPosition;
  readonly clientAuthorizations: readonly SubjectFactsClientAuthorization[];
}

export interface SubjectFactsSnapshotBase {
  readonly subjectIdentifier: string;
  readonly sourceDirtyVersion: string;
  readonly profile: {
    readonly username: string;
    readonly name: string;
    readonly phone: string | null;
  };
}

export interface EmploymentProfileBase {
  readonly isPrimary: boolean;
  readonly organization: SubjectOrganizationWithPath;
  readonly position: SubjectPosition;
}

export interface ClientAuthorizationEmploymentBase extends EmploymentProfileBase {
  readonly roles: readonly string[];
  readonly privileges: readonly string[];
}

export interface ClientAuthorizationBase {
  readonly employments: readonly ClientAuthorizationEmploymentBase[];
  readonly roles: readonly string[];
  readonly privileges: readonly string[];
}
