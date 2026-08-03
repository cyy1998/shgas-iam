import type {
  ClientSubjectProjectionService,
  SubjectFactsSnapshot,
} from "./index";
import { createClientSubjectProjectionService } from "./index";

export {
  assertCanonicalRehearsalSubjectClaimSeed,
  CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS,
  InvalidRehearsalSubjectClaimSeedError,
} from "./rehearsal-subject-claim-seed";

export interface InMemoryClientSubjectProjectionRecord {
  readonly subjectIdentifier: string;
  readonly facts?: SubjectFactsSnapshot;
  readonly freshAuthorizationSourceDirtyVersion?: string;
  readonly refreshedAuthorizationFacts?: SubjectFactsSnapshot;
}

export interface CreateInMemoryClientSubjectProjectionServiceOptions {
  readonly subjects: readonly InMemoryClientSubjectProjectionRecord[];
}

export function createInMemoryClientSubjectProjectionService(
  options: CreateInMemoryClientSubjectProjectionServiceOptions,
): ClientSubjectProjectionService {
  const subjects = new Map(options.subjects.map(subject => [subject.subjectIdentifier, subject]));

  return createClientSubjectProjectionService({
    subjectAccess: {
      async assertAccessible(subjectIdentifier) {
        if (!subjects.has(subjectIdentifier))
          throw new Error("In-memory subject access is unavailable");
      },
    },
    subjectFacts: {
      async read(subjectIdentifier) {
        return subjects.get(subjectIdentifier)?.facts ?? null;
      },
    },
    authorizationFreshness: {
      async check(input) {
        const subject = subjects.get(input.subjectIdentifier);
        if (subject?.freshAuthorizationSourceDirtyVersion === input.sourceDirtyVersion)
          return { status: "fresh" };
        if (subject?.refreshedAuthorizationFacts !== undefined) {
          return {
            status: "refreshed",
            facts: subject.refreshedAuthorizationFacts,
          };
        }
        return { status: "not-ready" };
      },
    },
  });
}
