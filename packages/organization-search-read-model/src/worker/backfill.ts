import type { db as database } from "@iam/db";
import { organizations } from "@iam/db/schema";
import { asc, gt } from "drizzle-orm";
import { persistOrganizationSearchChanges } from "../producer/source-changes";
import type { OrganizationSearchClock, OrganizationSearchJobProducerPort } from "../work.types";

export async function backfillOrganizationSearch(input: {
  db: typeof database;
  jobProducer: OrganizationSearchJobProducerPort;
  clock: OrganizationSearchClock;
  batchSize: number;
  signal?: AbortSignal;
}) {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1)
    throw new Error("Organization Search batch size must be positive");
  let afterId = 0;
  let registered = 0;
  let enqueued = 0;
  while (true) {
    input.signal?.throwIfAborted();
    const page = await input.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(gt(organizations.id, afterId))
      .orderBy(asc(organizations.id))
      .limit(input.batchSize);
    if (page.length === 0) break;
    const payloads = await input.db.transaction(
      async (tx) =>
        await persistOrganizationSearchChanges(
          tx,
          page.map(({ id }) => ({ organizationId: id, scope: "self" })),
          input.clock.nowDate(),
        ),
    );
    registered += payloads.length;
    input.signal?.throwIfAborted();
    enqueued += (await input.jobProducer.enqueueSourceChanges(payloads)).enqueued;
    afterId = page.at(-1)!.id;
  }
  return { registered, enqueued };
}
