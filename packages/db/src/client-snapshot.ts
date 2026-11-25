import { and, eq } from "drizzle-orm";
import type { DbClient } from "./index";
import { clients } from "./schema/core/clients";

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

type GenericClientRow = Pick<typeof clients.$inferSelect, keyof typeof genericClientSelection>;

export function createGenericClientRepository<T>(db: DbClient, toRuntime: (row: GenericClientRow) => T) {
  return {
    async getClientByCode(code: string) {
      const [row] = await db.select(genericClientSelection).from(clients).where(eq(clients.clientCode, code)).limit(1);
      return row ? toRuntime(row) : null;
    },
    async getClientBySecret(secret: string) {
      const [row] = await db
        .select(genericClientSelection)
        .from(clients)
        .where(eq(clients.clientSecret, secret))
        .limit(1);
      return row ? toRuntime(row) : null;
    },
  };
}

export function createClientSnapshotRepository(db: DbClient) {
  const where = (code: string) => and(eq(clients.clientCode, code), eq(clients.isDelete, false));
  return {
    async loadClient(code: string) {
      const rows = await db
        .select({
          clientCode: clients.clientCode,
          status: clients.status,
          ssoEnabled: clients.ssoEnabled,
          ssoConfig: clients.ssoConfig,
          admissionEnabled: clients.admissionEnabled,
          admissionFilter: clients.admissionFilter,
        })
        .from(clients)
        .where(where(code))
        .limit(1);
      return rows[0] ?? null;
    },
    async loadCredential(code: string) {
      const rows = await db
        .select({
          secret: clients.ssoSecret,
          credentialId: clients.ssoCredentialId,
          updatedAt: clients.ssoSecretUpdatedAt,
        })
        .from(clients)
        .where(where(code))
        .limit(1);
      const row = rows[0];
      if (!row || row.secret === null) return null;
      return {
        secret: row.secret,
        credentialId: row.credentialId,
        updatedAt: row.updatedAt === null ? null : new Date(row.updatedAt).toISOString(),
      };
    },
  };
}
