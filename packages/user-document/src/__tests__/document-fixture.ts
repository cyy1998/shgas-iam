import { OrganizationLevel, OrganizationType, UserStatus, UserType } from "@iam/contracts";
import { createDocumentFactsCacheRecord, type StoredUserDocument } from "../document";

export const DOCUMENT_FIXTURE_AT = new Date("2026-10-26T10:00:00.000Z");
export function publication(userId = 1, sourceVersion = "1") {
  const subjectIdentifier = `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`;
  const document: StoredUserDocument = {
    subjectIdentifier,
    username: `user-${userId}`,
    name: `User ${userId}`,
    mobile: null,
    wxId: null,
    userType: UserType.Formal,
    status: UserStatus.Enable,
    employments: [],
  };
  return {
    userId,
    subjectIdentifier,
    schemaVersion: 1 as const,
    sourceVersion,
    publishedAt: DOCUMENT_FIXTURE_AT,
    document,
  };
}
export function organization(code: string) {
  return {
    code,
    name: code,
    type: OrganizationType.Department,
    path: [{ code, name: code, type: OrganizationType.Department, level: OrganizationLevel.One, distanceToTarget: 0 }],
  };
}
export function factsRecord(userId = 1, sourceVersion = "1") {
  const record = createDocumentFactsCacheRecord(publication(userId, sourceVersion));
  if (record.kind !== "document") throw new Error("Fixture requires a complete document");
  return record;
}
