import type { DbClient } from "@iam/db";
import { clients } from "@iam/db/schema";
import { eq } from "drizzle-orm";
import type { GatewayCredentialReader } from "../services/gateway/gateway.port";

export function createClientCredentialReader(db: DbClient): GatewayCredentialReader {
  return {
    async readByClientCode(clientCode) {
      const [record] = await db
        .select({ clientSecret: clients.clientSecret, status: clients.status, isDelete: clients.isDelete })
        .from(clients)
        .where(eq(clients.clientCode, clientCode))
        .limit(1);
      return record ?? null;
    },
  };
}
