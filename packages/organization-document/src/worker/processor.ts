import type { db as database } from "@iam/db";
import {
  organizationClosures,
  organizationDocumentOutboxEntries,
  organizationDocumentRebuildStates,
  organizationDocuments,
} from "@iam/db/schema";
import {
  createDocumentUpdateProcessor,
  type DocumentRepairOptions,
  type DocumentRepairStageReport,
  type PreparedDocumentPublication,
} from "@iam/document-update";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
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
import { readOrganizationDocumentSourceSnapshot } from "./builder";

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
    async publish(tx, prepared) {
      const document = prepared.document === null ? null : parseStoredOrganizationDocument(prepared.document);
      const [stored] = await tx
        .select({ sourceVersion: organizationDocuments.sourceVersion })
        .from(organizationDocuments)
        .where(eq(organizationDocuments.organizationId, prepared.targetId));
      if (stored && BigInt(stored.sourceVersion) > BigInt(prepared.version))
        throw new Error("Organization Document publication version exceeds rebuild version");
      const row = {
        organizationId: prepared.targetId,
        sourceVersion: prepared.version,
        schemaVersion: ORGANIZATION_DOCUMENT_SCHEMA_VERSION,
        document,
        searchVisible: document !== null,
        rebuiltAt: prepared.rebuiltAt,
      };
      await tx
        .insert(organizationDocuments)
        .values(row)
        .onConflictDoUpdate({ target: organizationDocuments.organizationId, set: row });
    },
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
    return await processor.publishPrepared(candidate);
  }
  return {
    processOutbox: processor.processOutbox,
    prepareRebuild,
    publishPrepared,
    async processRebuild(payload: OrganizationRebuildJobPayload) {
      const prepared = await prepareRebuild(payload);
      return prepared ? await publishPrepared(prepared) : { status: "skipped" as const };
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
