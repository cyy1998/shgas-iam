import type { DbClient } from "@iam/db";

export function createClientRepository(db: DbClient) {
  return {
    async getClientByCode(clientCode: string) {
      return await db.query.clients.findFirst({
        where: { clientCode },
      }) ?? null;
    },
    async getClientBySecret(clientSecret: string) {
      return await db.query.clients.findFirst({
        where: { clientSecret },
      }) ?? null;
    },
  };
}

export type ClientRepository = ReturnType<typeof createClientRepository>;
