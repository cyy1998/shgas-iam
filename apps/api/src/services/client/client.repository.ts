import type { DbClient } from "@iam/db";
import db from "@iam/db";

export async function getClientByCode(clientCode: string, tx: DbClient = db) {
  return await tx.query.clients.findFirst({
    where: { clientCode },
  }) ?? null;
}

export async function getClientBySecret(clientSecret: string, tx: DbClient = db) {
  return await tx.query.clients.findFirst({
    where: { clientSecret },
  }) ?? null;
}
