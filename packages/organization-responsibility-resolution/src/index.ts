import type { OrganizationResponsibilityTypeCode } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { createResolver } from "./internal/resolver.ts";

export interface EffectiveOrganizationResponsibility {
  readonly typeCode: OrganizationResponsibilityTypeCode;
  readonly targetOrganizationId: number;
}

export interface ResolveEffectiveResponsibilitiesInput {
  readonly employmentIds: readonly number[];
  readonly at: Date;
}

export interface ResolveHolderEmploymentIdsInput {
  readonly targetOrganizationIds: readonly number[];
  readonly typeCodes?: readonly OrganizationResponsibilityTypeCode[];
  readonly at: Date;
}

export interface ResolveHolderEmploymentIdsByTypesInput {
  readonly typeCodes: readonly OrganizationResponsibilityTypeCode[];
  readonly at: Date;
}

export type OrganizationResponsibilityIntegrityFailureReason
  = | "assignment-type-unknown"
    | "assignment-status-unknown"
    | "holder-employment-missing"
    | "holder-employment-status-unknown"
    | "holder-employment-not-open"
    | "open-assignment-period-invalid"
    | "assignment-period-outside-observation"
    | "enabled-assignment-without-effective-employment"
    | "target-organization-missing"
    | "target-organization-status-unknown"
    | "target-organization-not-effective"
    | "head-cardinality-violated"
    | "supervising-holder-duplicated";

export class OrganizationResponsibilityIntegrityError extends Error {
  readonly code = "ORGANIZATION_RESPONSIBILITY_INTEGRITY_FAILED";

  constructor(readonly reason: OrganizationResponsibilityIntegrityFailureReason) {
    super("Organization Responsibility integrity failed");
    this.name = "OrganizationResponsibilityIntegrityError";
  }
}

export interface OrganizationResponsibilityResolver {
  readonly resolveEffectiveResponsibilities: (
    input: ResolveEffectiveResponsibilitiesInput,
  ) => Promise<ReadonlyMap<number, readonly EffectiveOrganizationResponsibility[]>>;
  readonly resolveHolderEmploymentIds: (
    input: ResolveHolderEmploymentIdsInput,
  ) => Promise<readonly number[]>;
  readonly resolveHolderEmploymentIdsByTypes: (
    input: ResolveHolderEmploymentIdsByTypesInput,
  ) => Promise<readonly number[]>;
}

export function createOrganizationResponsibilityResolver(
  db: DbClient,
): OrganizationResponsibilityResolver {
  return createResolver(db);
}
