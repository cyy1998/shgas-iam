import type {
  UserProfileDetailDocument,
  UserProfileSearchDocument,
  UserProfileSubjectFactsDocument,
} from "@iam/db/schema";
import type { PublishedUserProfile } from "./user-profile.schema";

export function toUserProfileRow(input: PublishedUserProfile) {
  return {
    ...input,
    detail: input.detail as unknown as UserProfileDetailDocument,
    searchDoc: input.searchDoc as unknown as UserProfileSearchDocument,
    subjectFacts: input.subjectFacts as unknown as UserProfileSubjectFactsDocument,
  };
}
