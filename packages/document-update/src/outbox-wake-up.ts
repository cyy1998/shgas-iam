import type { DocumentOutboxJob } from "./index";

/** Bind one instance to one source transaction; registration never changes durable Outbox rows. */
export function createDocumentOutboxWakeUp(options: {
  afterCommit: { bestEffort: (name: string, callback: () => Promise<void> | void) => void };
  taskName: string;
  enqueue: (jobs: DocumentOutboxJob[]) => Promise<unknown>;
}) {
  const pending: DocumentOutboxJob[] = [];
  let registered = false;
  return {
    register(jobs: readonly DocumentOutboxJob[]) {
      if (!jobs.length) return;
      pending.push(...jobs);
      if (registered) return;
      registered = true;
      options.afterCommit.bestEffort(options.taskName, async () => {
        await options.enqueue([...pending]);
      });
    },
  };
}
