import type { DbClient } from "./index";
import { and, eq } from "drizzle-orm";
import { clients } from "./schema/core/clients";

export function createClientSnapshotRepository(db: DbClient) {
  const where = (code: string) =>
    and(eq(clients.clientCode, code), eq(clients.isDelete, false));
  return {
    async loadClient(code: string) {
      const rows = await db
        .select({
          clientCode: clients.clientCode,
          status: clients.status,
          ssoEnabled: clients.ssoEnabled,
          ssoConfig: clients.ssoConfig,
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
      if (!row || row.secret === null)
        return null;
      return {
        secret: row.secret,
        credentialId: row.credentialId,
        updatedAt:
          row.updatedAt === null ? null : new Date(row.updatedAt).toISOString(),
      };
    },
  };
}
