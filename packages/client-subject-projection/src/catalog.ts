import type { SubjectClaimName } from "@iam/contracts";
import type { OptionalSubjectClaim, SubjectClaimSelection } from "./index";
import { SubjectClaim } from "@iam/contracts";

interface SubjectClaimCatalogDeclaration {
  readonly catalogVersion: unknown;
  readonly claims: readonly unknown[];
}

export type SubjectClaimCatalogGroup = "identity" | "profile" | "authorization";

export interface SubjectClaimCatalogEntryV1 {
  readonly claim: SubjectClaimName;
  readonly group: SubjectClaimCatalogGroup;
  readonly required: boolean;
  readonly wirePath: string;
}

const subjectClaimCatalogEntriesV1 = [
  {
    claim: SubjectClaim.SubjectIdentifier,
    group: "identity",
    required: true,
    wirePath: "subjectIdentifier",
  },
  {
    claim: SubjectClaim.ProfileUsername,
    group: "profile",
    required: false,
    wirePath: "profile.username",
  },
  {
    claim: SubjectClaim.ProfileName,
    group: "profile",
    required: false,
    wirePath: "profile.name",
  },
  {
    claim: SubjectClaim.ProfilePhone,
    group: "profile",
    required: false,
    wirePath: "profile.phone",
  },
  {
    claim: SubjectClaim.ProfileEmployments,
    group: "profile",
    required: false,
    wirePath: "profile.employments",
  },
  {
    claim: SubjectClaim.IamAuthorization,
    group: "authorization",
    required: false,
    wirePath: "authorization",
  },
] as const satisfies readonly SubjectClaimCatalogEntryV1[];

export const SUBJECT_CLAIM_CATALOG_V1 = {
  version: 1,
  claims: subjectClaimCatalogEntriesV1,
  requiredClaims: subjectClaimCatalogEntriesV1
    .filter(entry => entry.required)
    .map(entry => entry.claim),
  optionalClaims: subjectClaimCatalogEntriesV1
    .filter(entry => !entry.required)
    .map(entry => entry.claim),
} as const;

const optionalSubjectClaims = new Set<string>(SUBJECT_CLAIM_CATALOG_V1.optionalClaims);

export class InvalidSubjectClaimSelectionError extends Error {
  public readonly code = "INVALID_SUBJECT_CLAIM_SELECTION";

  constructor() {
    super("Subject Claim Selection is invalid");
    this.name = "InvalidSubjectClaimSelectionError";
  }
}

export function assertSubjectClaimSelection(
  input: unknown,
): asserts input is SubjectClaimSelection {
  if (typeof input !== "object"
    || input === null
    || !("catalogVersion" in input)
    || input.catalogVersion !== 1
    || !("optionalClaims" in input)
    || !Array.isArray(input.optionalClaims)) {
    throw new InvalidSubjectClaimSelectionError();
  }

  const seen = new Set<string>();
  for (const claim of input.optionalClaims) {
    if (typeof claim !== "string" || !optionalSubjectClaims.has(claim) || seen.has(claim))
      throw new InvalidSubjectClaimSelectionError();
    seen.add(claim);
  }
}

export function parseSubjectClaimSelection(
  input: unknown,
): SubjectClaimSelection {
  if (!isCatalogDeclaration(input) || input.catalogVersion !== 1)
    throw new InvalidSubjectClaimSelectionError();

  const seen = new Set<string>();
  for (const claim of input.claims) {
    if (typeof claim !== "string"
      || (claim !== SubjectClaim.SubjectIdentifier && !optionalSubjectClaims.has(claim))
      || seen.has(claim)) {
      throw new InvalidSubjectClaimSelectionError();
    }
    seen.add(claim);
  }
  if (!seen.has(SubjectClaim.SubjectIdentifier))
    throw new InvalidSubjectClaimSelectionError();

  return {
    catalogVersion: 1,
    optionalClaims: input.claims.filter(claim => claim !== SubjectClaim.SubjectIdentifier) as OptionalSubjectClaim[],
  };
}

function isCatalogDeclaration(input: unknown): input is SubjectClaimCatalogDeclaration {
  return typeof input === "object"
    && input !== null
    && "catalogVersion" in input
    && "claims" in input
    && Array.isArray(input.claims);
}
