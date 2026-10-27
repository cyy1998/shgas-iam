import { isDeepStrictEqual } from "node:util";
import type { db as database } from "@iam/db";
import {
  organizationDocumentOutboxEntries,
  organizationDocumentRebuildStates,
  organizationDocuments,
  organizations,
} from "@iam/db/schema";
import { asc } from "drizzle-orm";
import { ZodError, z } from "zod";
import {
  ORGANIZATION_DOCUMENT_SCHEMA_VERSION,
  type OrganizationDocument,
  OrganizationDocumentSchema,
  parseStoredOrganizationDocument,
} from "../schema";
import { OrganizationRebuildJobPayloadSchema } from "../work.types";
import { createOrganizationDocumentSourceReader, OrganizationDocumentSourceIntegrityError } from "./builder";

export interface OrganizationDocumentVerificationFailure {
  code: string;
  count: number;
  organizationIds: number[];
  outboxIds: string[];
}

export interface OrganizationDocumentVerificationReport {
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
    rebuildStates: number;
    outbox: number;
  };
  failures: OrganizationDocumentVerificationFailure[];
}

export function createOrganizationDocumentVerifier(input: { db: typeof database; clock?: { nowDate: () => Date } }) {
  return {
    async verify(options: { signal?: AbortSignal } = {}): Promise<OrganizationDocumentVerificationReport> {
      const { signal } = options;
      signal?.throwIfAborted();
      return await input.db.transaction(
        async (tx) => {
          const source = await tx.select().from(organizations).orderBy(asc(organizations.id));
          signal?.throwIfAborted();
          const documents = await tx.select().from(organizationDocuments);
          signal?.throwIfAborted();
          const dirty = await tx.select().from(organizationDocumentRebuildStates);
          signal?.throwIfAborted();
          const changes = await tx.select().from(organizationDocumentOutboxEntries);
          signal?.throwIfAborted();
          const documentIds = new Set(documents.map((row) => row.organizationId));
          const dirtyIds = new Set(dirty.map((row) => row.organizationId));
          const failures: OrganizationDocumentVerificationFailure[] = [];
          for (const [code, ids] of [
            ["missing-document", documentIds],
            ["missing-rebuild-state", dirtyIds],
          ] as const) {
            const organizationIds = source.filter((row) => !ids.has(row.id)).map((row) => row.id);
            if (organizationIds.length)
              failures.push({ code, count: organizationIds.length, organizationIds, outboxIds: [] });
          }
          const schemaMismatch = documents
            .filter((row) => row.schemaVersion !== ORGANIZATION_DOCUMENT_SCHEMA_VERSION)
            .map((row) => row.organizationId)
            .sort((a, b) => a - b);
          if (schemaMismatch.length)
            failures.push({
              code: "schema-mismatch",
              count: schemaMismatch.length,
              organizationIds: schemaMismatch,
              outboxIds: [],
            });
          const invalidDocument = documents
            .filter((row) => {
              if (row.document === null) return false;
              try {
                parseStoredOrganizationDocument(row.document);
                return false;
              } catch {
                return true;
              }
            })
            .map((row) => row.organizationId)
            .sort((a, b) => a - b);
          if (invalidDocument.length)
            failures.push({
              code: "invalid-document",
              count: invalidDocument.length,
              organizationIds: invalidDocument,
              outboxIds: [],
            });
          const storedById = new Map(documents.map((row) => [row.organizationId, row]));
          const reader = createOrganizationDocumentSourceReader(tx);
          const mismatches: number[] = [];
          const invalidSourcePaths: number[] = [];
          for (const row of source) {
            let expected: OrganizationDocument | null;
            try {
              expected = await reader.readDocument(row.id, signal);
            } catch (error) {
              if (!(error instanceof OrganizationDocumentSourceIntegrityError) && !(error instanceof ZodError))
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
              outboxIds: [],
            });
          if (invalidSourcePaths.length)
            failures.push({
              code: "invalid-source-path",
              count: invalidSourcePaths.length,
              organizationIds: invalidSourcePaths,
              outboxIds: [],
            });
          const unprocessedDirty = dirty
            .filter((row) => row.status !== "processed")
            .map((row) => row.organizationId)
            .sort((a, b) => a - b);
          if (unprocessedDirty.length)
            failures.push({
              code: "unprocessed-rebuild-state",
              count: unprocessedDirty.length,
              organizationIds: unprocessedDirty,
              outboxIds: [],
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
              outboxIds: [],
            });
          const unprocessedChanges = changes.filter((row) => row.status !== "processed");
          if (unprocessedChanges.length)
            failures.push({
              code: "unprocessed-outbox",
              count: unprocessedChanges.length,
              organizationIds: [...new Set(unprocessedChanges.map((row) => row.organizationId))].sort((a, b) => a - b),
              outboxIds: unprocessedChanges.map((row) => row.id).sort(),
            });
          const invalidDirtyReceipts = dirty
            .filter((row) => row.status === "processed" && !hasCompletedReceipt(row))
            .map((row) => row.organizationId)
            .sort((a, b) => a - b);
          if (invalidDirtyReceipts.length)
            failures.push({
              code: "invalid-rebuild-receipt",
              count: invalidDirtyReceipts.length,
              organizationIds: invalidDirtyReceipts,
              outboxIds: [],
            });
          const requestsByChange = new Map(
            changes.map((row) => [
              row.id,
              z
                .object({ targetId: z.number().int().positive(), version: z.string().regex(/^[1-9]\d*$/u) })
                .array()
                .min(1)
                .safeParse(row.rebuildRequests),
            ]),
          );
          const invalidChangeReceipts = changes.filter((row) => {
            if (row.status !== "processed") return false;
            const requests = requestsByChange.get(row.id);
            return (
              !hasCompletedReceipt(row) ||
              !requests?.success ||
              !requests.data.some((request) => request.targetId === row.organizationId) ||
              new Set(requests.data.map((request) => request.targetId)).size !== requests.data.length
            );
          });
          if (invalidChangeReceipts.length)
            failures.push({
              code: "invalid-outbox-receipt",
              count: invalidChangeReceipts.length,
              organizationIds: [...new Set(invalidChangeReceipts.map((row) => row.organizationId))].sort(
                (a, b) => a - b,
              ),
              outboxIds: invalidChangeReceipts.map((row) => row.id).sort(),
            });
          const unfulfilledChanges = changes.filter((row) => {
            const requests = requestsByChange.get(row.id);
            return (
              row.status === "processed" &&
              requests?.success === true &&
              requests.data.some((request) => {
                const work = dirtyById.get(request.targetId);
                const publication = storedById.get(request.targetId);
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
              code: "unfulfilled-outbox",
              count: unfulfilledChanges.length,
              organizationIds: [...new Set(unfulfilledChanges.map((row) => row.organizationId))].sort((a, b) => a - b),
              outboxIds: unfulfilledChanges.map((row) => row.id).sort(),
            });
          const sourceIds = new Set(source.map((row) => row.id));
          for (const [code, rows] of [
            ["orphan-document", documents],
            ["orphan-rebuild-state", dirty],
          ] as const) {
            const organizationIds = rows
              .filter((row) => !sourceIds.has(row.organizationId))
              .map((row) => row.organizationId)
              .sort((a, b) => a - b);
            if (organizationIds.length)
              failures.push({ code, count: organizationIds.length, organizationIds, outboxIds: [] });
          }
          const orphanChanges = changes.filter((row) => !sourceIds.has(row.organizationId));
          if (orphanChanges.length)
            failures.push({
              code: "orphan-outbox",
              count: orphanChanges.length,
              organizationIds: [...new Set(orphanChanges.map((row) => row.organizationId))].sort((a, b) => a - b),
              outboxIds: orphanChanges.map((row) => row.id).sort(),
            });
          signal?.throwIfAborted();
          return {
            version: 1,
            schemaVersion: ORGANIZATION_DOCUMENT_SCHEMA_VERSION,
            verifiedAt: (input.clock?.nowDate() ?? new Date()).toISOString(),
            status: failures.length ? "failed" : "passed",
            counts: {
              organizations: source.length,
              deletedOrganizations: source.filter((row) => row.isDelete).length,
              documents: documents.length,
              visibleDocuments: documents.filter((row) => row.searchVisible).length,
              tombstones: documents.filter((row) => !row.searchVisible).length,
              rebuildStates: dirty.length,
              outbox: changes.length,
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

export type OrganizationDocumentVerifier = ReturnType<typeof createOrganizationDocumentVerifier>;
