import type {
  UserProfileDetailDocument,
  UserProfileSearchDocument,
  UserProfileSubjectFactsDocument,
} from "@iam/db/schema";
import type { PublishedProfileRowInput } from "./profile-storage.schema";

export function toUserProfileRow(input: PublishedProfileRowInput) {
  return {
    ...input,
    detail: input.detail as unknown as UserProfileDetailDocument,
    searchDoc: input.searchDoc as unknown as UserProfileSearchDocument,
    subjectFacts: input.subjectFacts as unknown as UserProfileSubjectFactsDocument,
  };
}
