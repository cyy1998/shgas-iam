import {
  DocumentResponsibilitySchema,
  OrganizationLevel,
  OrganizationPathNodeSchema,
  OrganizationReferenceSchema,
} from "@iam/contracts";
import { z } from "zod";
import type {
  ClientAuthorizationBase,
  ClientAuthorizationEmploymentBase,
  EmploymentProfileBase,
  OptionalSubjectClaim,
  SubjectFactsEmploymentBase,
  SubjectFactsSnapshotBase,
} from "../index";

export interface SubjectClaimSelection {
  readonly catalogVersion: 3;
  readonly optionalClaims: readonly OptionalSubjectClaim[];
}

export const EmploymentResponsibilitySnapshotSchema = DocumentResponsibilitySchema.safeExtend({
  type: DocumentResponsibilitySchema.shape.type.strict(),
  targetOrganization: OrganizationReferenceSchema.safeExtend({
    path: z.array(OrganizationPathNodeSchema.strict()).min(1).max(OrganizationLevel.Five),
  }).strict(),
}).strict();

export type EmploymentResponsibilitySnapshot = z.infer<typeof EmploymentResponsibilitySnapshotSchema>;

export interface SubjectFactsEmployment extends SubjectFactsEmploymentBase {
  readonly responsibilities: readonly {
    readonly type: EmploymentResponsibilitySnapshot["type"];
    readonly targetOrganization: SubjectFactsEmploymentBase["organization"];
  }[];
}

export interface SubjectFactsSnapshot extends SubjectFactsSnapshotBase {
  readonly employments: readonly SubjectFactsEmployment[];
}

export interface EmploymentProfile extends EmploymentProfileBase {
  readonly responsibilities: readonly EmploymentResponsibilitySnapshot[];
}

export type ClientAuthorizationEmployment = ClientAuthorizationEmploymentBase;

export type ClientAuthorization = ClientAuthorizationBase;

export interface ClientSubjectProjection {
  readonly subjectIdentifier: string;
  readonly username?: string;
  readonly name?: string;
  readonly phone?: string | null;
  readonly employments?: readonly EmploymentProfile[];
  readonly authorization?: ClientAuthorization;
}

export interface ResolveClientSubjectInput {
  readonly subjectIdentifier: string;
  readonly clientCode: string;
  readonly selection: SubjectClaimSelection;
}

export interface ClientSubjectProjectionService {
  readonly resolve: (input: ResolveClientSubjectInput) => Promise<ClientSubjectProjection>;
}

export interface PermittedClientSubjectProjectionService<Permission> {
  readonly resolve: (input: ResolveClientSubjectInput, permission: Permission) => Promise<ClientSubjectProjection>;
}

export interface CreatePermittedClientSubjectProjectionServiceOptions<Permission> extends ProjectionFactsOptions {
  /** Prove the permission belongs to the current open operation and requested subject. */
  readonly assertPermission: (permission: Permission, subjectIdentifier: string) => void;
}

export interface ProjectionFactsOptions {
  readonly subjectFacts: {
    readonly read: (subjectIdentifier: string) => Promise<SubjectFactsSnapshot | null>;
  };
}
