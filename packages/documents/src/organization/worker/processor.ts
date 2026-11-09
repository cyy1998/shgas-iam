import type { DbTransaction, db as database } from "@iam/db";
import {
  organizationClosures,
  organizationDocumentOutboxEntries,
  organizationDocumentRebuildStates,
  organizationDocuments,
} from "@iam/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  createDocumentUpdateProcessor,
  type DocumentBuildResult,
  type DocumentRepairOptions,
  type DocumentRepairStageReport,
  type PreparedDocumentPublication,
} from "../../update";
import {
  ORGANIZATION_DOCUMENT_SCHEMA_VERSION,
  type OrganizationDocument,
  parseStoredOrganizationDocument,
} from "../schema";
import {
  type OrganizationDocumentClock,
  type OrganizationDocumentJobProducerPort,
  type OrganizationRebuildJobPayload,
  OrganizationRebuildJobPayloadSchema,
} from "../work.types";
import { backfillOrganizationDocument } from "./backfill";
import {
  createOrganizationDocumentSourceReader,
  OrganizationDocumentSourceIntegrityError,
  readOrganizationDocumentSourceSnapshot,
} from "./builder";

export interface PreparedOrganizationDocumentPublication extends OrganizationRebuildJobPayload {
  readonly processingToken: string;
  readonly document: OrganizationDocument | null;
  readonly rebuiltAt: Date;
}
export interface CreateOrganizationDocumentProcessorInput {
  db: typeof database;
  jobProducer: OrganizationDocumentJobProducerPort;
  clock?: OrganizationDocumentClock;
}
export type OrganizationDocumentRepairOptions = DocumentRepairOptions;
export type OrganizationDocumentRepairStageReport = DocumentRepairStageReport;

export function createOrganizationDocumentProcessor(input: CreateOrganizationDocumentProcessorInput) {
  const sourceSchema = z.strictObject({
    organizationId: z.number().int().positive(),
    scope: z.enum(["self", "subtree"]),
  });
  async function publishDocuments(
    tx: DbTransaction,
    prepared: readonly PreparedDocumentPublication<OrganizationDocument | null>[],
  ) {
    if (!prepared.length) return [];
    const rows = prepared
      .map((candidate) => {
        const document = candidate.document === null ? null : parseStoredOrganizationDocument(candidate.document);
        return {
          organizationId: candidate.targetId,
          sourceVersion: candidate.version,
          schemaVersion: ORGANIZATION_DOCUMENT_SCHEMA_VERSION,
          document,
          searchVisible: document !== null,
          rebuiltAt: candidate.rebuiltAt,
        };
      })
      .sort((left, right) => left.organizationId - right.organizationId);
    const stored = await tx
      .insert(organizationDocuments)
      .values(rows)
      .onConflictDoUpdate({
        target: organizationDocuments.organizationId,
        set: {
          sourceVersion: sql`excluded.source_version`,
          schemaVersion: sql`excluded.schema_version`,
          document: sql`excluded.document`,
          searchVisible: sql`excluded.search_visible`,
          rebuiltAt: sql`excluded.rebuilt_at`,
        },
        setWhere: sql`${organizationDocuments.sourceVersion} <= excluded.source_version`,
      })
      .returning({ organizationId: organizationDocuments.organizationId });
    return stored.map(({ organizationId }) => organizationId);
  }
  const processor = createDocumentUpdateProcessor({
    db: input.db,
    clock: input.clock,
    tables: {
      outbox: organizationDocumentOutboxEntries,
      source: sql<
        z.infer<typeof sourceSchema>
      >`jsonb_build_object('organizationId', ${organizationDocumentOutboxEntries.organizationId}, 'scope', ${organizationDocumentOutboxEntries.scope})`,
      rebuildState: organizationDocumentRebuildStates,
      targetId: organizationDocumentRebuildStates.organizationId,
      requestedAt: organizationDocumentRebuildStates.dirtyAt,
    },
    parseSource: (source) => sourceSchema.parse(source),
    async expand(tx, source) {
      const descendants =
        source.scope === "subtree"
          ? await tx
              .select({ id: organizationClosures.descendantId })
              .from(organizationClosures)
              .where(eq(organizationClosures.ancestorId, source.organizationId))
              .orderBy(asc(organizationClosures.descendantId))
          : [];
      return [source.organizationId, ...descendants.map(({ id }) => id)];
    },
    build: async (targetId) => await readOrganizationDocumentSourceSnapshot(input.db, targetId),
    async buildMany(tx, requests) {
      const reader = createOrganizationDocumentSourceReader(tx);
      const results: DocumentBuildResult<OrganizationDocument | null>[] = [];
      for (const request of requests) {
        try {
          const document = await reader.readDocument(request.targetId);
          results.push({ ...request, status: "built", document });
        } catch (error) {
          if (!(error instanceof OrganizationDocumentSourceIntegrityError) && !(error instanceof z.ZodError))
            throw error;
          results.push({ ...request, status: "failed", error });
        }
      }
      return results;
    },
    async publish(tx, prepared) {
      const written = await publishDocuments(tx, [prepared]);
      if (written.length !== 1) throw new Error("Organization Document publication is older than stored version");
    },
    publishMany: publishDocuments,
    jobProducer: {
      enqueueOutboxEntries: input.jobProducer.enqueueOutboxEntries,
      enqueueRebuilds: async (requests) =>
        await input.jobProducer.enqueueRebuilds(
          requests.map(({ targetId, version }) => ({ organizationId: targetId, version })),
        ),
    },
  });
  async function prepareRebuild(
    raw: OrganizationRebuildJobPayload,
  ): Promise<PreparedOrganizationDocumentPublication | null> {
    const payload = OrganizationRebuildJobPayloadSchema.parse(raw);
    const prepared = await processor.prepareRebuild({ targetId: payload.organizationId, version: payload.version });
    if (!prepared) return null;
    return {
      ...payload,
      processingToken: prepared.processingToken,
      document: prepared.document,
      rebuiltAt: prepared.rebuiltAt,
    };
  }
  async function publishPrepared(prepared: PreparedOrganizationDocumentPublication) {
    const candidate: PreparedDocumentPublication<OrganizationDocument | null> = {
      targetId: prepared.organizationId,
      version: prepared.version,
      processingToken: prepared.processingToken,
      document: prepared.document,
      rebuiltAt: prepared.rebuiltAt,
    };
    const outcome = await processor.publishPreparedBatch([candidate]);
    if (outcome.failed.length)
      throw new AggregateError(
        outcome.failed.map(({ error }) => error),
        "Organization Document publication failed",
      );
    return { status: outcome.published.length ? ("published" as const) : ("stale" as const) };
  }
  return {
    processOutbox: processor.processOutbox,
    prepareRebuild,
    publishPrepared,
    async processRebuild(payload: OrganizationRebuildJobPayload) {
      const request = OrganizationRebuildJobPayloadSchema.parse(payload);
      const outcome = await processor.processRebuildBatch(
        [{ targetId: request.organizationId, version: request.version }],
        {
          batchSize: 1,
        },
      );
      if (outcome.failures.length) throw new AggregateError(outcome.failures, "Organization Document rebuild failed");
      return {
        status: outcome.rebuilt ? ("published" as const) : outcome.stale ? ("stale" as const) : ("skipped" as const),
      };
    },
    async backfillAllOrganizations(options: { batchSize?: number; signal?: AbortSignal } = {}) {
      return await backfillOrganizationDocument({
        ...input,
        clock: input.clock ?? { nowDate: () => new Date() },
        batchSize: options.batchSize ?? 500,
        signal: options.signal,
      });
    },
    repairFailedOrStale: processor.repairFailedOrStale,
  };
}
export type OrganizationDocumentProcessor = ReturnType<typeof createOrganizationDocumentProcessor>;
export type OrganizationDocumentRepairReport = Awaited<
  ReturnType<OrganizationDocumentProcessor["repairFailedOrStale"]>
>;
