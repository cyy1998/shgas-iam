import type { SubjectClaimName } from "@iam/contracts";
import { SubjectClaim } from "@iam/contracts";
import { parseSubjectClaimSelection } from "./catalog";

export class InvalidRehearsalSubjectClaimSeedError extends Error {
  override readonly name = "InvalidRehearsalSubjectClaimSeedError";

  constructor() {
    super("Custom SSO rehearsal Subject Claim seed is not canonical");
  }
}

function defineCanonicalSeed<const TClaims extends readonly SubjectClaimName[]>(
  claims: TClaims,
) {
  parseSubjectClaimSelection({ catalogVersion: 1, claims });
  return Object.freeze([...claims]) as Readonly<TClaims>;
}

export const CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS = Object.freeze({
  gateway: defineCanonicalSeed([
    SubjectClaim.SubjectIdentifier,
    SubjectClaim.ProfileUsername,
    SubjectClaim.ProfileName,
  ]),
  independent: defineCanonicalSeed([
    SubjectClaim.SubjectIdentifier,
  ]),
});

export function assertCanonicalRehearsalSubjectClaimSeed<
  TMode extends keyof typeof CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS,
>(
  mode: TMode,
  input: unknown,
): asserts input is typeof CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS[TMode] {
  try {
    parseSubjectClaimSelection({ catalogVersion: 1, claims: input });
  }
  catch {
    throw new InvalidRehearsalSubjectClaimSeedError();
  }
  const expected = CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS[mode];
  if (
    !Array.isArray(input)
    || input.length !== expected.length
    || input.some((claim, index) => claim !== expected[index])
  ) {
    throw new InvalidRehearsalSubjectClaimSeedError();
  }
}
