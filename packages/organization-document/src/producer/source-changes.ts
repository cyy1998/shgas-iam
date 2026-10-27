import type { DbClient } from "@iam/db";
import type { OrganizationDocumentSourceScope } from "@iam/db/schema";
import { organizationDocumentOutboxEntries } from "@iam/db/schema";
import { persistDocumentOutboxEntries } from "@iam/document-update";
import { z } from "zod";
import type { OrganizationDocumentClock, OrganizationDocumentJobProducerPort } from "../work.types";

const changedFieldSchema = z.enum(["code", "name", "type", "status", "isVirtual", "isEntity"]);
export type OrganizationDocumentChangedField = z.infer<typeof changedFieldSchema>;
export type OrganizationDocumentSourceChange =
  | { kind: "created" | "deleted"; organizationId: number }
  | { kind: "updated"; organizationId: number; changedFields: readonly OrganizationDocumentChangedField[] };

export interface CreateOrganizationDocumentInvalidationInput {
  db: DbClient;
  jobProducer: Pick<OrganizationDocumentJobProducerPort, "enqueueOutboxEntries">;
  lifecycle: { afterCommit: { bestEffort: (name: string, callback: () => Promise<void> | void) => void } };
  clock?: OrganizationDocumentClock;
}

/** Bind to the source transaction. Call only after the source write; delivery runs after commit. */
export function createOrganizationDocumentInvalidation(input: CreateOrganizationDocumentInvalidationInput) {
  const clock = input.clock ?? { nowDate: () => new Date() };
  return {
    async recordChanges(changes: readonly OrganizationDocumentSourceChange[]): Promise<void> {
      const scopes = new Map<number, OrganizationDocumentSourceScope>();
      for (const change of changes) {
        z.number().int().positive().parse(change.organizationId);
        let scope: OrganizationDocumentSourceScope = "self";
        if (change.kind === "updated") {
          const fields = z.array(changedFieldSchema).parse(change.changedFields);
          if (fields.length === 0) continue;
          if (fields.some((field) => field === "code" || field === "name" || field === "type")) scope = "subtree";
        }
        if (scopes.get(change.organizationId) !== "subtree") scopes.set(change.organizationId, scope);
      }
      const payloads = await persistOrganizationDocumentChanges(
        input.db,
        [...scopes].sort(([a], [b]) => a - b).map(([organizationId, scope]) => ({ organizationId, scope })),
        clock.nowDate(),
      );
      if (payloads.length === 0) return;
      input.lifecycle.afterCommit.bestEffort("organization_document.outbox.wake_up", async () => {
        await input.jobProducer.enqueueOutboxEntries(payloads);
      });
    },
  };
}

export type OrganizationDocumentInvalidation = ReturnType<typeof createOrganizationDocumentInvalidation>;

export async function persistOrganizationDocumentChanges(
  db: DbClient,
  changes: { organizationId: number; scope: OrganizationDocumentSourceScope }[],
  now: Date,
) {
  return await persistDocumentOutboxEntries(
    db,
    changes,
    async (tx, entries) => {
      await tx.insert(organizationDocumentOutboxEntries).values(
        entries.map(({ id, source, createdAt }) => ({
          ...source,
          id,
          createdAt,
          updatedAt: createdAt,
        })),
      );
    },
    now,
  );
}
