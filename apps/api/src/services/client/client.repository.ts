import type { DbClient } from "@iam/db";
import type { GenericClientRecord } from "@iam/domain/client";
import { clients } from "@iam/db/schema";
import { GenericClientRecordSchema } from "@iam/domain/client";
import { eq } from "drizzle-orm";

const genericClientSelection = {
  id: clients.id,
  clientCode: clients.clientCode,
  clientName: clients.clientName,
  clientSecret: clients.clientSecret,
  url: clients.url,
  status: clients.status,
  description: clients.description,
  isDelete: clients.isDelete,
  createTime: clients.createTime,
  updateTime: clients.updateTime,
};

export function createClientRepository(db: DbClient) {
  return {
    async getClientByCode(clientCode: string): Promise<GenericClientRecord | null> {
      const [row] = await db.select(genericClientSelection)
        .from(clients)
        .where(eq(clients.clientCode, clientCode))
        .limit(1);
      return row ? GenericClientRecordSchema.parse(row) : null;
    },
    async getClientBySecret(clientSecret: string): Promise<GenericClientRecord | null> {
      const [row] = await db.select(genericClientSelection)
        .from(clients)
        .where(eq(clients.clientSecret, clientSecret))
        .limit(1);
      return row ? GenericClientRecordSchema.parse(row) : null;
    },
  };
}

export type ClientRepository = ReturnType<typeof createClientRepository>;
