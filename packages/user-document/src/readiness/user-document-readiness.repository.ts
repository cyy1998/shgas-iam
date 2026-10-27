import { UserDocumentWorkStatus, UserStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { userDocumentRebuildStates, userDocuments, users } from "@iam/db/schema";
import { asc, eq, gt, sql } from "drizzle-orm";
import type { PublishedUserDocument } from "../document";
import type { UserDocumentProjectionBundle } from "../worker/user-document-projection";
import type { UserDocumentReadinessPageRow } from "./user-document-readiness";
import { verifyUserDocumentWork } from "./user-document-work-verification";
export function createUserDocumentReadinessRepository<
  TDocument extends PublishedUserDocument,
  TFactsRecord extends { subjectIdentifier: string; sourceVersion: string },
>(
  db: DbClient,
  options: { projection: UserDocumentProjectionBundle<TDocument, TFactsRecord>; buildBatchSize: number },
) {
  return {
    async readVerificationSummary() {
      const [summary] = await db.execute<{
        userCount: number;
        documentCount: number;
        documentSubjectCount: number;
        distinctDocumentSubjectCount: number;
        orphanDocumentCount: number;
      }>(sql`SELECT
        (SELECT COUNT(*)::int FROM ${users}) AS "userCount",
        (SELECT COUNT(*)::int FROM ${userDocuments}) AS "documentCount",
        (SELECT COUNT(${userDocuments.subjectIdentifier})::int FROM ${userDocuments}) AS "documentSubjectCount",
        (SELECT COUNT(DISTINCT ${userDocuments.subjectIdentifier})::int FROM ${userDocuments}) AS "distinctDocumentSubjectCount",
        (SELECT COUNT(*)::int FROM ${userDocuments} LEFT JOIN ${users} ON ${users.id}=${userDocuments.userId} WHERE ${users.id} IS NULL) AS "orphanDocumentCount"`);
      if (!summary) throw new Error("User Document readiness summary is incomplete");
      return { ...summary, ...(await verifyUserDocumentWork(db)) };
    },
    async scanPage(input: {
      afterUserId: number;
      limit: number;
    }): Promise<Array<UserDocumentReadinessPageRow<TDocument>>> {
      const rows = await db
        .select({
          userId: users.id,
          userSubjectIdentifier: users.subjectIdentifier,
          userStatus: users.status,
          userDeleted: users.isDelete,
          documentUserId: userDocuments.userId,
          documentSubjectIdentifier: userDocuments.subjectIdentifier,
          schemaVersion: userDocuments.schemaVersion,
          sourceVersion: userDocuments.sourceVersion,
          publishedAt: userDocuments.publishedAt,
          document: userDocuments.document,
          requiredVersion: userDocumentRebuildStates.version,
          rebuildStatus: userDocumentRebuildStates.status,
          postVersion: userDocumentRebuildStates.postPublicationVersion,
          postStatus: userDocumentRebuildStates.postPublicationStatus,
        })
        .from(users)
        .leftJoin(userDocuments, eq(userDocuments.userId, users.id))
        .leftJoin(userDocumentRebuildStates, eq(userDocumentRebuildStates.userId, users.id))
        .where(gt(users.id, input.afterUserId))
        .orderBy(asc(users.id))
        .limit(input.limit);
      return rows.map((row) => {
        const base = {
          userId: row.userId,
          subjectIdentifier: row.userSubjectIdentifier,
          accountAvailable: row.userStatus === UserStatus.Enable && !row.userDeleted,
        };
        const issue = (code: string): UserDocumentReadinessPageRow<TDocument> => ({
          ...base,
          currentDocument: null,
          documentIssue: code,
        });
        if (row.documentUserId === null) return issue("document-missing");
        if (row.schemaVersion !== options.projection.schemaVersion) return issue("document-version-mismatch");
        if (row.documentSubjectIdentifier !== row.userSubjectIdentifier) return issue("document-identity-mismatch");
        let currentDocument: TDocument;
        try {
          currentDocument = options.projection.parseDocumentRow({
            userId: row.documentUserId,
            subjectIdentifier: row.documentSubjectIdentifier,
            schemaVersion: row.schemaVersion,
            sourceVersion: row.sourceVersion,
            publishedAt: row.publishedAt,
            document: row.document,
          });
        } catch {
          return issue("document-invalid");
        }
        if (
          row.userDeleted !== (currentDocument.document === null) ||
          (currentDocument.document !== null && currentDocument.document.status !== row.userStatus)
        )
          return issue("document-identity-mismatch");
        if (
          row.rebuildStatus !== UserDocumentWorkStatus.Processed ||
          row.requiredVersion !== currentDocument.sourceVersion
        )
          return issue("document-not-current");
        if (row.postVersion !== currentDocument.sourceVersion || row.postStatus !== "processed")
          return issue("document-post-publication-incomplete");
        return {
          ...base,
          currentDocument,
          documentIssue: null,
        };
      });
    },
    async rebuildExpected(profiles: TDocument[], observedAt: Date) {
      if (!profiles.length) return [];
      return await options.projection
        .createBuilder({ db, clock: { nowDate: () => observedAt }, batchSize: options.buildBatchSize })
        .buildMany(profiles.map((profile) => ({ userId: profile.userId, sourceVersion: profile.sourceVersion })));
    },
  };
}
