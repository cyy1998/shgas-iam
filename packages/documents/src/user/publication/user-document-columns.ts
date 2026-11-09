import { userDocuments } from "@iam/db/schema";
export const publishedUserDocumentColumns = {
  userId: userDocuments.userId,
  subjectIdentifier: userDocuments.subjectIdentifier,
  schemaVersion: userDocuments.schemaVersion,
  sourceVersion: userDocuments.sourceVersion,
  publishedAt: userDocuments.publishedAt,
  document: userDocuments.document,
};
