import { randomUUID } from "node:crypto";
import type { DbClient } from "@iam/db";
import type { OrganizationSearchChangeScope } from "@iam/db/schema";
import { organizationSearchChanges } from "@iam/db/schema";
import { z } from "zod";
import type { OrganizationSearchClock, OrganizationSearchJobProducerPort } from "../work.types";

const changedFieldSchema = z.enum(["code", "name", "type", "status", "isVirtual", "isEntity"]);
export type OrganizationSearchChangedField = z.infer<typeof changedFieldSchema>;
export type OrganizationSearchSourceChange =
  | { kind: "created" | "deleted"; organizationId: number }
  | { kind: "updated"; organizationId: number; changedFields: readonly OrganizationSearchChangedField[] };

export interface CreateOrganizationSearchInvalidationInput {
  db: DbClient;
  jobProducer: Pick<OrganizationSearchJobProducerPort, "enqueueSourceChanges">;
  lifecycle: { afterCommit: { bestEffort: (name: string, callback: () => Promise<void> | void) => void } };
  clock?: OrganizationSearchClock;
}

/** Bind to the source transaction. Call only after the source write; delivery runs after commit. */
export function createOrganizationSearchInvalidation(input: CreateOrganizationSearchInvalidationInput) {
  const clock = input.clock ?? { nowDate: () => new Date() };
  return {
    async recordChanges(changes: readonly OrganizationSearchSourceChange[]): Promise<void> {
      const scopes = new Map<number, OrganizationSearchChangeScope>();
      for (const change of changes) {
        z.number().int().positive().parse(change.organizationId);
        let scope: OrganizationSearchChangeScope = "self";
        if (change.kind === "updated") {
          const fields = z.array(changedFieldSchema).parse(change.changedFields);
          if (fields.length === 0) continue;
          if (fields.some((field) => field === "code" || field === "name" || field === "type")) scope = "subtree";
        }
        if (scopes.get(change.organizationId) !== "subtree") scopes.set(change.organizationId, scope);
      }
      const payloads = await persistOrganizationSearchChanges(
        input.db,
        [...scopes].sort(([a], [b]) => a - b).map(([organizationId, scope]) => ({ organizationId, scope })),
        clock.nowDate(),
      );
      if (payloads.length === 0) return;
      input.lifecycle.afterCommit.bestEffort("organization_search.source_change.wake_up", async () => {
        await input.jobProducer.enqueueSourceChanges(payloads);
      });
    },
  };
}

export type OrganizationSearchInvalidation = ReturnType<typeof createOrganizationSearchInvalidation>;

export async function persistOrganizationSearchChanges(
  db: DbClient,
  changes: { organizationId: number; scope: OrganizationSearchChangeScope }[],
  now: Date,
) {
  if (changes.length === 0) return [];
  const rows = changes.map((change) => ({ ...change, id: randomUUID(), createdAt: now, updatedAt: now }));
  await db.insert(organizationSearchChanges).values(rows);
  return rows.map(({ id }) => ({ changeId: id }));
}
