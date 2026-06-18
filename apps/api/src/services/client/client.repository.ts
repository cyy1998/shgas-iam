import type { DbClient } from "@iam/db";

export function createClientRepository(db: DbClient) {
  return {
    getClientByCode(clientCode: string) {
      return getClientByCode(clientCode, db);
    },
    getClientBySecret(clientSecret: string) {
      return getClientBySecret(clientSecret, db);
    },
  };
}

export type ClientRepository = ReturnType<typeof createClientRepository>;

async function getClientByCode(clientCode: string, tx: DbClient) {
  return await tx.query.clients.findFirst({
    where: { clientCode },
  }) ?? null;
}

async function getClientBySecret(clientSecret: string, tx: DbClient) {
  return await tx.query.clients.findFirst({
    where: { clientSecret },
  }) ?? null;
}
