import { CustomAttributeCodeSchema } from "@iam/contracts/custom-attributes";
import type { DbClient } from "@iam/db";
import type { OrganizationDocumentSourceScope } from "@iam/db/schema";
import { organizationDocumentOutboxEntries } from "@iam/db/schema";
import { z } from "zod";
import { createDocumentOutboxWakeUp, persistDocumentOutboxEntries } from "../../update";
import type { OrganizationDocumentClock, OrganizationDocumentJobProducerPort } from "../work.types";

const organizationIdSchema = z.number().int().positive();
export const OrganizationDocumentOutboxSourceSchema = z.union([
  z.strictObject({ organizationId: organizationIdSchema, scope: z.enum(["self", "subtree"]) }),
  z.strictObject({ attributeCode: CustomAttributeCodeSchema }),
]);
type OrganizationDocumentOutboxSource = z.infer<typeof OrganizationDocumentOutboxSourceSchema>;

const changedFieldSchema = z.enum(["code", "name", "type", "status", "isVirtual", "isEntity", "customAttributes"]);
export type OrganizationDocumentChangedField = z.infer<typeof changedFieldSchema>;
export type OrganizationDocumentSourceChange =
  | { kind: "created" | "deleted"; organizationId: number }
  | { kind: "custom-attribute-definition"; attributeCode: string }
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
  const wakeUp = createDocumentOutboxWakeUp({
    afterCommit: input.lifecycle.afterCommit,
    taskName: "organization_document.outbox.wake_up",
    enqueue: (jobs) => input.jobProducer.enqueueOutboxEntries(jobs),
  });
  return {
    async recordChanges(changes: readonly OrganizationDocumentSourceChange[]): Promise<void> {
      const scopes = new Map<number, OrganizationDocumentSourceScope>();
      const attributeCodes = new Set<string>();
      for (const change of changes) {
        if (change.kind === "custom-attribute-definition") {
          attributeCodes.add(CustomAttributeCodeSchema.parse(change.attributeCode));
          continue;
        }
        organizationIdSchema.parse(change.organizationId);
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
        [
          ...[...scopes].sort(([a], [b]) => a - b).map(([organizationId, scope]) => ({ organizationId, scope })),
          ...[...attributeCodes].sort().map((attributeCode) => ({ attributeCode })),
        ],
        clock.nowDate(),
      );
      wakeUp.register(payloads);
    },
  };
}

export type OrganizationDocumentInvalidation = ReturnType<typeof createOrganizationDocumentInvalidation>;

export async function persistOrganizationDocumentChanges(
  db: DbClient,
  changes: OrganizationDocumentOutboxSource[],
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
