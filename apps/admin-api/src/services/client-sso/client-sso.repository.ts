import type { DbClient } from "@iam/db";
import type { ClientSsoStorageUpdate } from "./client-sso.type";
import { clients, roles } from "@iam/db/schema";
import { ClientSsoAdminDtoSchema, ClientSsoAdminRecordSchema } from "@iam/domain/client";
import { and, eq, isNotNull } from "drizzle-orm";

const columns = {
  id: clients.id,
  clientCode: clients.clientCode,
  clientName: clients.clientName,
  status: clients.status,
  isDelete: clients.isDelete,
  url: clients.url,
  description: clients.description,
  ssoConfig: clients.ssoConfig,
  ssoEnabled: clients.ssoEnabled,
  ssoSecret: clients.ssoSecret,
  ssoCredentialId: clients.ssoCredentialId,
  ssoSecretUpdatedAt: clients.ssoSecretUpdatedAt,
};

const detailColumns = {
  id: clients.id,
  clientCode: clients.clientCode,
  clientName: clients.clientName,
  status: clients.status,
  isDelete: clients.isDelete,
  url: clients.url,
  description: clients.description,
  ssoConfig: clients.ssoConfig,
  ssoEnabled: clients.ssoEnabled,
  hasSsoSecret: isNotNull(clients.ssoSecret),
};

export function createClientSsoRepository(db: DbClient) {
  const where = (clientCode: string) => and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false));
  const parse = (rows: unknown[]) => rows[0] === undefined ? null : ClientSsoAdminRecordSchema.parse(rows[0]);
  return {
    async getDetail(clientCode: string) {
      const rows = await db.select(detailColumns).from(clients).where(where(clientCode));
      return rows[0] === undefined ? null : ClientSsoAdminDtoSchema.parse(rows[0]);
    },
    async get(clientCode: string) {
      return parse(await db.select(columns).from(clients).where(where(clientCode)));
    },
    async lock(clientCode: string, includeDeleted = false) {
      return parse(await db.select(columns).from(clients).where(includeDeleted ? eq(clients.clientCode, clientCode) : where(clientCode)).for("update"));
    },
    async hasUndeletedRoles(clientId: number) {
      const rows = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.clientId, clientId), eq(roles.isDelete, false)))
        .limit(1);
      return rows.length > 0;
    },
    async update(clientCode: string, patch: ClientSsoStorageUpdate) {
      try {
        return parse(await db.update(clients).set(patch).where(where(clientCode)).returning(columns));
      }
      catch {
        // Drizzle driver errors may contain SQL parameters, including the new plaintext Secret.
        throw new Error("Client SSO storage update failed");
      }
    },
  };
}
