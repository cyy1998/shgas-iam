import type { OptionalSubjectClaim } from "../index";
import type { SubjectClaimSelection } from "./contract";
import { SubjectClaim } from "@iam/contracts";
import { InvalidSubjectClaimSelectionError } from "../subject-claim-selection.error";

interface SubjectClaimCatalogDeclaration {
  readonly catalogVersion: unknown;
  readonly claims: readonly unknown[];
}

const subjectClaimCatalogEntries = [
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
] as const;

export const SUBJECT_CLAIM_CATALOG = {
  version: 2,
  claims: subjectClaimCatalogEntries,
  requiredClaims: subjectClaimCatalogEntries
    .filter(entry => entry.required)
    .map(entry => entry.claim),
  optionalClaims: subjectClaimCatalogEntries
    .filter(entry => !entry.required)
    .map(entry => entry.claim),
} as const;

const optionalSubjectClaims = new Set<string>(
  SUBJECT_CLAIM_CATALOG.optionalClaims,
);

export function parseSubjectClaimSelection(
  input: unknown,
): SubjectClaimSelection {
  if (!isCatalogDeclaration(input) || input.catalogVersion !== 2)
    throw new InvalidSubjectClaimSelectionError();

  const seen = new Set<string>();
  for (const claim of input.claims) {
    if (
      typeof claim !== "string"
      || (claim !== SubjectClaim.SubjectIdentifier && !optionalSubjectClaims.has(claim))
      || seen.has(claim)
    ) {
      throw new InvalidSubjectClaimSelectionError();
    }
    seen.add(claim);
  }
  if (!seen.has(SubjectClaim.SubjectIdentifier))
    throw new InvalidSubjectClaimSelectionError();

  return {
    catalogVersion: 2,
    optionalClaims: input.claims.filter(
      claim => claim !== SubjectClaim.SubjectIdentifier,
    ) as OptionalSubjectClaim[],
  };
}

export function assertSubjectClaimSelection(
  input: unknown,
): asserts input is SubjectClaimSelection {
  if (
    typeof input !== "object"
    || input === null
    || !("catalogVersion" in input)
    || input.catalogVersion !== 2
    || !("optionalClaims" in input)
    || !Array.isArray(input.optionalClaims)
  ) {
    throw new InvalidSubjectClaimSelectionError();
  }

  const seen = new Set<string>();
  for (const claim of input.optionalClaims) {
    if (
      typeof claim !== "string"
      || !optionalSubjectClaims.has(claim)
      || seen.has(claim)
    ) {
      throw new InvalidSubjectClaimSelectionError();
    }
    seen.add(claim);
  }
}

function isCatalogDeclaration(
  input: unknown,
): input is SubjectClaimCatalogDeclaration {
  return typeof input === "object"
    && input !== null
    && "catalogVersion" in input
    && "claims" in input
    && Array.isArray(input.claims);
}
