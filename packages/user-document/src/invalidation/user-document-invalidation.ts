import type { DbClient } from "@iam/db";
import { userDocumentOutboxEntries } from "@iam/db/schema";
import { type DocumentOutboxJob, persistDocumentOutboxEntries } from "@iam/document-update";
import {
  type UserDocumentOutboxSource,
  UserDocumentOutboxSourceSchema,
  type UserDocumentSourceChange,
} from "./user-document-source";

export type { UserDocumentSourceChange } from "./user-document-source";

export interface CreateUserDocumentInvalidationDeps {
  db: DbClient;
  jobProducer: { enqueueOutboxEntries: (inputs: DocumentOutboxJob[]) => Promise<{ enqueued: number }> };
  lifecycle: {
    afterCommit: { bestEffort: (name: string, callback: () => Promise<void> | void) => void };
    observability: { requestId?: string | null; traceId?: string | null } | null;
  };
  clock: { nowDate: () => Date };
}

export function createUserDocumentInvalidation(deps: CreateUserDocumentInvalidationDeps) {
  return {
    async recordChanges(changes: readonly UserDocumentSourceChange[]): Promise<void> {
      const sources = changes.map((change) =>
        UserDocumentOutboxSourceSchema.parse({
          change,
          requestId: deps.lifecycle.observability?.requestId ?? undefined,
          traceId: deps.lifecycle.observability?.traceId ?? undefined,
        }),
      );
      const jobs = await persistUserDocumentSources(deps.db, sources, deps.clock.nowDate());
      if (!jobs.length) return;
      deps.lifecycle.afterCommit.bestEffort("user_document.outbox.wake_up", async () => {
        await deps.jobProducer.enqueueOutboxEntries(jobs);
      });
    },
  };
}

export type UserDocumentInvalidation = ReturnType<typeof createUserDocumentInvalidation>;

export async function persistUserDocumentSources(
  db: DbClient,
  sources: readonly UserDocumentOutboxSource[],
  createdAt: Date,
) {
  return await persistDocumentOutboxEntries(
    db,
    sources,
    async (tx, entries) => {
      await tx
        .insert(userDocumentOutboxEntries)
        .values(entries.map(({ id, source, createdAt }) => ({ id, source, createdAt, updatedAt: createdAt })));
    },
    createdAt,
  );
}
