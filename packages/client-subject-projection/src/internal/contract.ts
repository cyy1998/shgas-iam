import type {
  ClientAuthorizationBase,
  ClientAuthorizationEmploymentBase,
  EmploymentProfileBase,
  OptionalSubjectClaim,
  SubjectFactsEmploymentBase,
  SubjectFactsSnapshotBase,
} from "../index";
import {
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";
import { z } from "zod";

export interface SubjectClaimSelection {
  readonly catalogVersion: 2;
  readonly optionalClaims: readonly OptionalSubjectClaim[];
}

const ResponsibilityOrganizationNodeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(OrganizationType),
}).strict();

export const EmploymentResponsibilitySnapshotSchema = z.object({
  type: z.object({
    code: z.enum(OrganizationResponsibilityTypeCode),
    name: z.string().min(1),
  }).strict(),
  targetOrganization: ResponsibilityOrganizationNodeSchema.extend({
    path: z.array(ResponsibilityOrganizationNodeSchema).min(1),
  }).strict(),
}).strict().superRefine((responsibility, context) => {
  const catalogEntry = ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.find(
    entry => entry.code === responsibility.type.code,
  );
  if (!catalogEntry || catalogEntry.name !== responsibility.type.name) {
    context.addIssue({
      code: "custom",
      path: ["type", "name"],
      message: "Responsibility type name is not canonical",
    });
  }

  const target = responsibility.targetOrganization;
  const terminal = target.path.at(-1);
  if (!terminal
    || terminal.code !== target.code
    || terminal.name !== target.name
    || terminal.type !== target.type) {
    context.addIssue({
      code: "custom",
      path: ["targetOrganization", "path"],
      message: "Responsibility path must end at its target organization",
    });
  }
});

export type EmploymentResponsibilitySnapshot = z.infer<
  typeof EmploymentResponsibilitySnapshotSchema
>;

export interface SubjectFactsEmployment
  extends SubjectFactsEmploymentBase {
  readonly responsibilities: readonly EmploymentResponsibilitySnapshot[];
}

export interface SubjectFactsSnapshot
  extends SubjectFactsSnapshotBase {
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
  readonly resolve: (
    input: ResolveClientSubjectInput,
  ) => Promise<ClientSubjectProjection>;
}

export type AuthorizationFreshnessCheckResult
  = | { readonly status: "fresh" }
    | {
      readonly status: "refreshed";
      readonly facts: SubjectFactsSnapshot;
    }
    | { readonly status: "not-ready" };

export interface PermittedClientSubjectProjectionService<Permission> {
  readonly resolve: (
    input: ResolveClientSubjectInput,
    permission: Permission,
  ) => Promise<ClientSubjectProjection>;
}

export interface CreatePermittedClientSubjectProjectionServiceOptions<Permission>
  extends ProjectionFactsOptions {
  /** Prove the permission belongs to the current open operation and requested subject. */
  readonly assertPermission: (permission: Permission, subjectIdentifier: string) => void;
}

export interface ProjectionFactsOptions {
  readonly subjectFacts: {
    readonly read: (
      subjectIdentifier: string,
    ) => Promise<SubjectFactsSnapshot | null>;
  };
  readonly authorizationFreshness: {
    readonly check: (input: {
      readonly subjectIdentifier: string;
      readonly sourceDirtyVersion: string;
    }) => Promise<AuthorizationFreshnessCheckResult>;
  };
}
