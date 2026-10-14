import { randomUUID } from "node:crypto";
import type { db as database } from "@iam/db";
import {
  organizationClosures,
  organizationSearchChanges,
  organizationSearchDirty,
  organizationSearchDocuments,
} from "@iam/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  ORGANIZATION_SEARCH_SCHEMA_VERSION,
  type OrganizationSearchDocument,
  OrganizationSearchDocumentSchema,
} from "../schema";
import {
  type OrganizationRebuildJobPayload,
  OrganizationRebuildJobPayloadSchema,
  type OrganizationSearchClock,
  type OrganizationSearchJobProducerPort,
  OrganizationSourceChangeJobPayloadSchema,
} from "../work.types";
import { backfillOrganizationSearch } from "./backfill";
import { readOrganizationSearchSourceSnapshot } from "./builder";
import { type OrganizationSearchRepairOptions, repairOrganizationSearch } from "./repair";

export interface PreparedOrganizationSearchPublication extends OrganizationRebuildJobPayload {
  readonly processingToken: string;
  readonly document: OrganizationSearchDocument | null;
  readonly rebuiltAt: Date;
}

export interface CreateOrganizationSearchProcessorInput {
  db: typeof database;
  jobProducer: OrganizationSearchJobProducerPort;
  clock?: OrganizationSearchClock;
}

export function createOrganizationSearchProcessor(input: CreateOrganizationSearchProcessorInput) {
  const clock = input.clock ?? { nowDate: () => new Date() };

  async function processSourceChange(raw: { changeId: string }) {
    const payload = OrganizationSourceChangeJobPayloadSchema.parse(raw);
    const token = randomUUID();
    const now = clock.nowDate();
    const [claimed] = await input.db
      .update(organizationSearchChanges)
      .set({
        status: "processing",
        processingToken: token,
        processingStartedAt: now,
        attempts: sql`${organizationSearchChanges.attempts} + 1`,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(organizationSearchChanges.id, payload.changeId),
          inArray(organizationSearchChanges.status, ["pending", "failed"]),
        ),
      )
      .returning();
    if (!claimed) {
      const [existing] = await input.db
        .select()
        .from(organizationSearchChanges)
        .where(eq(organizationSearchChanges.id, payload.changeId));
      if (existing?.status === "processed") {
        await input.jobProducer.enqueueRebuilds(
          existing.rebuildRequests.map((request) => OrganizationRebuildJobPayloadSchema.parse(request)),
        );
        return { status: "replayed" as const };
      }
      return { status: "skipped" as const };
    }
    let requests: OrganizationRebuildJobPayload[] | null;
    try {
      requests = await input.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(organizationSearchChanges)
          .where(eq(organizationSearchChanges.id, payload.changeId))
          .for("update");
        if (current?.status !== "processing" || current.processingToken !== token) return null;
        const descendants =
          current.scope === "subtree"
            ? await tx
                .select({ id: organizationClosures.descendantId })
                .from(organizationClosures)
                .where(eq(organizationClosures.ancestorId, current.organizationId))
                .orderBy(asc(organizationClosures.descendantId))
            : [];
        const ids = [...new Set([current.organizationId, ...descendants.map(({ id }) => id)])].sort((a, b) => a - b);
        const dirtyAt = clock.nowDate();
        const dirty = await tx
          .insert(organizationSearchDirty)
          .values(ids.map((organizationId) => ({ organizationId, dirtyAt, updatedAt: dirtyAt })))
          .onConflictDoUpdate({
            target: organizationSearchDirty.organizationId,
            set: {
              version: sql`${organizationSearchDirty.version} + 1`,
              status: "pending",
              processingToken: null,
              processingStartedAt: null,
              attempts: 0,
              lastError: null,
              dirtyAt,
              processedAt: null,
              updatedAt: dirtyAt,
            },
          })
          .returning({
            organizationId: organizationSearchDirty.organizationId,
            version: organizationSearchDirty.version,
          });
        const rebuilt = dirty.sort((a, b) => a.organizationId - b.organizationId);
        await tx
          .update(organizationSearchChanges)
          .set({
            status: "processed",
            rebuildRequests: rebuilt,
            processingToken: null,
            processingStartedAt: null,
            processedAt: dirtyAt,
            updatedAt: dirtyAt,
          })
          .where(eq(organizationSearchChanges.id, payload.changeId));
        return rebuilt;
      });
    } catch (error) {
      await input.db
        .update(organizationSearchChanges)
        .set({
          status: "failed",
          processingToken: null,
          processingStartedAt: null,
          lastError: errorMessage(error),
          updatedAt: clock.nowDate(),
        })
        .where(
          and(
            eq(organizationSearchChanges.id, payload.changeId),
            eq(organizationSearchChanges.status, "processing"),
            eq(organizationSearchChanges.processingToken, token),
          ),
        );
      throw error;
    }
    if (requests === null) return { status: "stale" as const };
    // The durable expansion is committed before waking the second stage. Replays re-send these exact payloads.
    await input.jobProducer.enqueueRebuilds(requests);
    return { status: "expanded" as const, registered: requests.length };
  }

  async function markRebuildFailed(
    prepared: OrganizationRebuildJobPayload & { processingToken: string },
    error: unknown,
  ) {
    await input.db
      .update(organizationSearchDirty)
      .set({
        status: "failed",
        processingToken: null,
        processingStartedAt: null,
        lastError: errorMessage(error),
        updatedAt: clock.nowDate(),
      })
      .where(
        and(
          eq(organizationSearchDirty.organizationId, prepared.organizationId),
          eq(organizationSearchDirty.version, prepared.version),
          eq(organizationSearchDirty.status, "processing"),
          eq(organizationSearchDirty.processingToken, prepared.processingToken),
        ),
      );
  }

  async function prepareRebuild(
    raw: OrganizationRebuildJobPayload,
  ): Promise<PreparedOrganizationSearchPublication | null> {
    const payload = OrganizationRebuildJobPayloadSchema.parse(raw);
    const processingToken = randomUUID();
    const now = clock.nowDate();
    const [claimed] = await input.db
      .update(organizationSearchDirty)
      .set({
        status: "processing",
        processingToken,
        processingStartedAt: now,
        attempts: sql`${organizationSearchDirty.attempts} + 1`,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(organizationSearchDirty.organizationId, payload.organizationId),
          eq(organizationSearchDirty.version, payload.version),
          inArray(organizationSearchDirty.status, ["pending", "failed"]),
        ),
      )
      .returning();
    if (!claimed) return null;
    try {
      const document = await readOrganizationSearchSourceSnapshot(input.db, payload.organizationId);
      return { ...payload, processingToken, document, rebuiltAt: clock.nowDate() };
    } catch (error) {
      await markRebuildFailed({ ...payload, processingToken }, error);
      throw error;
    }
  }

  async function publishPrepared(prepared: PreparedOrganizationSearchPublication) {
    try {
      return await input.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(organizationSearchDirty)
          .where(eq(organizationSearchDirty.organizationId, prepared.organizationId))
          .for("update");
        if (
          !current ||
          current.version !== prepared.version ||
          current.status !== "processing" ||
          current.processingToken !== prepared.processingToken
        )
          return { status: "stale" as const };
        const document = prepared.document === null ? null : OrganizationSearchDocumentSchema.parse(prepared.document);
        const [stored] = await tx
          .select({ sourceVersion: organizationSearchDocuments.sourceVersion })
          .from(organizationSearchDocuments)
          .where(eq(organizationSearchDocuments.organizationId, prepared.organizationId));
        if (stored && BigInt(stored.sourceVersion) > BigInt(prepared.version))
          throw new Error("Organization Search publication version exceeds work version");
        const row = {
          organizationId: prepared.organizationId,
          sourceVersion: prepared.version,
          schemaVersion: ORGANIZATION_SEARCH_SCHEMA_VERSION,
          document,
          searchVisible: document !== null,
          rebuiltAt: prepared.rebuiltAt,
        };
        await tx
          .insert(organizationSearchDocuments)
          .values(row)
          .onConflictDoUpdate({ target: organizationSearchDocuments.organizationId, set: row });
        const processedAt = clock.nowDate();
        await tx
          .update(organizationSearchDirty)
          .set({
            status: "processed",
            processingToken: null,
            processingStartedAt: null,
            lastError: null,
            processedAt,
            updatedAt: processedAt,
          })
          .where(eq(organizationSearchDirty.organizationId, prepared.organizationId));
        return { status: "published" as const };
      });
    } catch (error) {
      await markRebuildFailed(prepared, error);
      throw error;
    }
  }

  return {
    processSourceChange,
    prepareRebuild,
    publishPrepared,
    async processRebuild(payload: OrganizationRebuildJobPayload) {
      const prepared = await prepareRebuild(payload);
      if (!prepared) return { status: "skipped" as const };
      return await publishPrepared(prepared);
    },
    async backfillAllOrganizations(options: { batchSize?: number; signal?: AbortSignal } = {}) {
      return await backfillOrganizationSearch({
        ...input,
        clock,
        batchSize: options.batchSize ?? 500,
        signal: options.signal,
      });
    },
    async repairFailedOrStale(options: OrganizationSearchRepairOptions) {
      return await repairOrganizationSearch({ ...input, clock }, options);
    },
  };
}

export type OrganizationSearchProcessor = ReturnType<typeof createOrganizationSearchProcessor>;

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4000);
}
