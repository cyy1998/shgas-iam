import { isDeepStrictEqual } from "node:util";
import type { db as database } from "@iam/db";
import {
  organizationSearchChanges,
  organizationSearchDirty,
  organizationSearchDocuments,
  organizations,
} from "@iam/db/schema";
import { asc } from "drizzle-orm";
import { ZodError } from "zod";
import {
  ORGANIZATION_SEARCH_SCHEMA_VERSION,
  type OrganizationSearchDocument,
  OrganizationSearchDocumentSchema,
} from "../schema";
import { OrganizationRebuildJobPayloadSchema } from "../work.types";
import { createOrganizationSearchSourceReader, OrganizationSearchSourceIntegrityError } from "./builder";

export interface OrganizationSearchVerificationFailure {
  code: string;
  count: number;
  organizationIds: number[];
  changeIds: string[];
}

export interface OrganizationSearchVerificationReport {
  version: 1;
  schemaVersion: number;
  verifiedAt: string;
  status: "passed" | "failed";
  counts: {
    organizations: number;
    deletedOrganizations: number;
    documents: number;
    visibleDocuments: number;
    tombstones: number;
    dirty: number;
    changes: number;
  };
  failures: OrganizationSearchVerificationFailure[];
}

export function createOrganizationSearchVerifier(input: { db: typeof database; clock?: { nowDate: () => Date } }) {
  return {
    async verify(options: { signal?: AbortSignal } = {}): Promise<OrganizationSearchVerificationReport> {
      const { signal } = options;
      signal?.throwIfAborted();
      return await input.db.transaction(
        async (tx) => {
          const source = await tx.select().from(organizations).orderBy(asc(organizations.id));
          signal?.throwIfAborted();
          const documents = await tx.select().from(organizationSearchDocuments);
          signal?.throwIfAborted();
          const dirty = await tx.select().from(organizationSearchDirty);
          signal?.throwIfAborted();
          const changes = await tx.select().from(organizationSearchChanges);
          signal?.throwIfAborted();
          const documentIds = new Set(documents.map((row) => row.organizationId));
          const dirtyIds = new Set(dirty.map((row) => row.organizationId));
          const failures: OrganizationSearchVerificationFailure[] = [];
          for (const [code, ids] of [
            ["missing-document", documentIds],
            ["missing-dirty", dirtyIds],
          ] as const) {
            const organizationIds = source.filter((row) => !ids.has(row.id)).map((row) => row.id);
            if (organizationIds.length)
              failures.push({ code, count: organizationIds.length, organizationIds, changeIds: [] });
          }
          const schemaMismatch = documents
            .filter((row) => row.schemaVersion !== ORGANIZATION_SEARCH_SCHEMA_VERSION)
            .map((row) => row.organizationId)
            .sort((a, b) => a - b);
          if (schemaMismatch.length)
            failures.push({
              code: "schema-mismatch",
              count: schemaMismatch.length,
              organizationIds: schemaMismatch,
              changeIds: [],
            });
          const invalidDocument = documents
            .filter((row) => row.document !== null && !OrganizationSearchDocumentSchema.safeParse(row.document).success)
            .map((row) => row.organizationId)
            .sort((a, b) => a - b);
          if (invalidDocument.length)
            failures.push({
              code: "invalid-document",
              count: invalidDocument.length,
              organizationIds: invalidDocument,
              changeIds: [],
            });
          const storedById = new Map(documents.map((row) => [row.organizationId, row]));
          const reader = createOrganizationSearchSourceReader(tx);
          const mismatches: number[] = [];
          const invalidSourcePaths: number[] = [];
          for (const row of source) {
            let expected: OrganizationSearchDocument | null;
            try {
              expected = await reader.readDocument(row.id, signal);
            } catch (error) {
              if (!(error instanceof OrganizationSearchSourceIntegrityError) && !(error instanceof ZodError))
                throw error;
              invalidSourcePaths.push(row.id);
              continue;
            }
            const stored = storedById.get(row.id);
            if (
              stored &&
              (!isDeepStrictEqual(stored.document, expected) || stored.searchVisible !== (expected !== null))
            )
              mismatches.push(row.id);
          }
          if (mismatches.length)
            failures.push({
              code: "source-mismatch",
              count: mismatches.length,
              organizationIds: mismatches,
              changeIds: [],
            });
          if (invalidSourcePaths.length)
            failures.push({
              code: "invalid-source-path",
              count: invalidSourcePaths.length,
              organizationIds: invalidSourcePaths,
              changeIds: [],
            });
          const unprocessedDirty = dirty
            .filter((row) => row.status !== "processed")
            .map((row) => row.organizationId)
            .sort((a, b) => a - b);
          if (unprocessedDirty.length)
            failures.push({
              code: "unprocessed-dirty",
              count: unprocessedDirty.length,
              organizationIds: unprocessedDirty,
              changeIds: [],
            });
          const dirtyById = new Map(dirty.map((row) => [row.organizationId, row]));
          const versionMismatch = documents
            .filter(
              (row) =>
                dirtyById.has(row.organizationId) && dirtyById.get(row.organizationId)?.version !== row.sourceVersion,
            )
            .map((row) => row.organizationId)
            .sort((a, b) => a - b);
          if (versionMismatch.length)
            failures.push({
              code: "version-mismatch",
              count: versionMismatch.length,
              organizationIds: versionMismatch,
              changeIds: [],
            });
          const unprocessedChanges = changes.filter((row) => row.status !== "processed");
          if (unprocessedChanges.length)
            failures.push({
              code: "unprocessed-change",
              count: unprocessedChanges.length,
              organizationIds: [...new Set(unprocessedChanges.map((row) => row.organizationId))].sort((a, b) => a - b),
              changeIds: unprocessedChanges.map((row) => row.id).sort(),
            });
          const invalidDirtyReceipts = dirty
            .filter((row) => row.status === "processed" && !hasCompletedReceipt(row))
            .map((row) => row.organizationId)
            .sort((a, b) => a - b);
          if (invalidDirtyReceipts.length)
            failures.push({
              code: "invalid-dirty-receipt",
              count: invalidDirtyReceipts.length,
              organizationIds: invalidDirtyReceipts,
              changeIds: [],
            });
          const requestsByChange = new Map(
            changes.map((row) => [
              row.id,
              OrganizationRebuildJobPayloadSchema.array().min(1).safeParse(row.rebuildRequests),
            ]),
          );
          const invalidChangeReceipts = changes.filter((row) => {
            if (row.status !== "processed") return false;
            const requests = requestsByChange.get(row.id);
            return (
              !hasCompletedReceipt(row) ||
              !requests?.success ||
              !requests.data.some((request) => request.organizationId === row.organizationId) ||
              new Set(requests.data.map((request) => request.organizationId)).size !== requests.data.length
            );
          });
          if (invalidChangeReceipts.length)
            failures.push({
              code: "invalid-change-receipt",
              count: invalidChangeReceipts.length,
              organizationIds: [...new Set(invalidChangeReceipts.map((row) => row.organizationId))].sort(
                (a, b) => a - b,
              ),
              changeIds: invalidChangeReceipts.map((row) => row.id).sort(),
            });
          const unfulfilledChanges = changes.filter((row) => {
            const requests = requestsByChange.get(row.id);
            return (
              row.status === "processed" &&
              requests?.success === true &&
              requests.data.some((request) => {
                const work = dirtyById.get(request.organizationId);
                const publication = storedById.get(request.organizationId);
                return (
                  !work ||
                  !publication ||
                  BigInt(work.version) < BigInt(request.version) ||
                  BigInt(publication.sourceVersion) < BigInt(request.version)
                );
              })
            );
          });
          if (unfulfilledChanges.length)
            failures.push({
              code: "unfulfilled-change",
              count: unfulfilledChanges.length,
              organizationIds: [...new Set(unfulfilledChanges.map((row) => row.organizationId))].sort((a, b) => a - b),
              changeIds: unfulfilledChanges.map((row) => row.id).sort(),
            });
          const sourceIds = new Set(source.map((row) => row.id));
          for (const [code, rows] of [
            ["orphan-document", documents],
            ["orphan-dirty", dirty],
          ] as const) {
            const organizationIds = rows
              .filter((row) => !sourceIds.has(row.organizationId))
              .map((row) => row.organizationId)
              .sort((a, b) => a - b);
            if (organizationIds.length)
              failures.push({ code, count: organizationIds.length, organizationIds, changeIds: [] });
          }
          const orphanChanges = changes.filter((row) => !sourceIds.has(row.organizationId));
          if (orphanChanges.length)
            failures.push({
              code: "orphan-change",
              count: orphanChanges.length,
              organizationIds: [...new Set(orphanChanges.map((row) => row.organizationId))].sort((a, b) => a - b),
              changeIds: orphanChanges.map((row) => row.id).sort(),
            });
          signal?.throwIfAborted();
          return {
            version: 1,
            schemaVersion: ORGANIZATION_SEARCH_SCHEMA_VERSION,
            verifiedAt: (input.clock?.nowDate() ?? new Date()).toISOString(),
            status: failures.length ? "failed" : "passed",
            counts: {
              organizations: source.length,
              deletedOrganizations: source.filter((row) => row.isDelete).length,
              documents: documents.length,
              visibleDocuments: documents.filter((row) => row.searchVisible).length,
              tombstones: documents.filter((row) => !row.searchVisible).length,
              dirty: dirty.length,
              changes: changes.length,
            },
            failures,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}

function hasCompletedReceipt(row: {
  processedAt: Date | null;
  processingToken: string | null;
  processingStartedAt: Date | null;
  lastError: string | null;
}) {
  return (
    row.processedAt !== null &&
    row.processingToken === null &&
    row.processingStartedAt === null &&
    row.lastError === null
  );
}

export type OrganizationSearchVerifier = ReturnType<typeof createOrganizationSearchVerifier>;
