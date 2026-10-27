import type { DbClient } from "@iam/db";
import { createCurrentUserDocumentProjectionBundle } from "@iam/user-document/worker";

/** Publishes a source-backed document through the same builder and row owner as the Worker. */
export async function publishUserDocument(db: DbClient, userId: number, sourceVersion = "1") {
  const projection = createCurrentUserDocumentProjectionBundle();
  const document = await projection
    .createBuilder({ db, clock: { nowDate: () => new Date() }, batchSize: 100 })
    .buildOne({ userId, sourceVersion });
  if (document === null) throw new Error(`User Document source ${userId} is missing`);
  const published = await projection.createRowRepository(db).upsert(document);
  if (!published) throw new Error(`User Document source ${userId} retained a newer publication`);
  return document;
}
