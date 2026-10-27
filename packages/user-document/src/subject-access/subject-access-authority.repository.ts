import { UserDocumentWorkStatus, UserStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { userDocumentOutboxEntries, userDocumentRebuildStates, userDocuments, users } from "@iam/db/schema";
import { eq, sql } from "drizzle-orm";
import { createDocumentFactsCacheRecord, PublishedUserDocumentSchema } from "../document";
import type { SubjectFactsPublisherPort } from "../worker/user-document-rebuild.processor";
export interface CreateSubjectAccessAuthorityRepositoryOptions {
  readonly db: DbClient;
  readonly subjectFactsPublisher: SubjectFactsPublisherPort;
}
export function createSubjectAccessAuthorityRepository(options: CreateSubjectAccessAuthorityRepositoryOptions) {
  return {
    async resolve(subjectIdentifier: string) {
      const [row] = await options.db
        .select({
          accountStatus: users.status,
          accountDeleted: users.isDelete,
          userId: userDocuments.userId,
          subjectIdentifier: userDocuments.subjectIdentifier,
          schemaVersion: userDocuments.schemaVersion,
          sourceVersion: userDocuments.sourceVersion,
          publishedAt: userDocuments.publishedAt,
          document: userDocuments.document,
          requiredVersion: userDocumentRebuildStates.version,
          rebuildStatus: userDocumentRebuildStates.status,
          sourcePending: sql<boolean>`EXISTS (SELECT 1 FROM ${userDocumentOutboxEntries} WHERE ${userDocumentOutboxEntries.status} <> 'processed' AND ${userDocumentOutboxEntries.source} @> jsonb_build_object('change', jsonb_build_object('userId', ${users.id})))`,
        })
        .from(users)
        .leftJoin(userDocuments, eq(userDocuments.userId, users.id))
        .leftJoin(userDocumentRebuildStates, eq(userDocumentRebuildStates.userId, users.id))
        .where(eq(users.subjectIdentifier, subjectIdentifier))
        .limit(1);
      if (!row || row.accountStatus !== UserStatus.Enable || row.accountDeleted)
        return { accountState: "disabled" as const, factsState: "not_current" as const };
      const notCurrent = { accountState: "enabled" as const, factsState: "not_current" as const };
      if (
        row.sourcePending ||
        row.rebuildStatus !== UserDocumentWorkStatus.Processed ||
        row.requiredVersion === null ||
        row.sourceVersion !== row.requiredVersion
      )
        return notCurrent;
      const publication = PublishedUserDocumentSchema.safeParse({
        userId: row.userId,
        subjectIdentifier: row.subjectIdentifier,
        schemaVersion: row.schemaVersion,
        sourceVersion: row.sourceVersion,
        publishedAt: row.publishedAt,
        document: row.document,
      });
      if (
        !publication.success ||
        publication.data.document === null ||
        publication.data.subjectIdentifier !== subjectIdentifier
      )
        return notCurrent;
      const result = await options.subjectFactsPublisher.publish(createDocumentFactsCacheRecord(publication.data));
      return result.status === "published"
        ? { accountState: "enabled" as const, factsState: "current" as const }
        : notCurrent;
    },
  };
}
export type SubjectAccessAuthorityRepository = ReturnType<typeof createSubjectAccessAuthorityRepository>;
