import type { DbClient } from "@iam/db";
import { userDocumentOutboxEntries } from "@iam/db/schema";
import { createDocumentOutboxWakeUp, type DocumentOutboxJob, persistDocumentOutboxEntries } from "@iam/document-update";
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
  const wakeUp = createDocumentOutboxWakeUp({
    afterCommit: deps.lifecycle.afterCommit,
    taskName: "user_document.outbox.wake_up",
    enqueue: (jobs) => deps.jobProducer.enqueueOutboxEntries(jobs),
  });
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
      wakeUp.register(jobs);
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
