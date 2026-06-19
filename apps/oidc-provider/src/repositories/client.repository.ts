import type { DbClient } from "@iam/db";
import type { OidcClientRuntimeDto, OidcClientSecretRecord } from "@iam/domain/client";
import {
  ClientStatus,
  OidcClientType,
} from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { OidcClientRuntimeDtoSchema, OidcClientSecretRecordSchema } from "@iam/domain/client";
import { and, eq } from "drizzle-orm";

export function createOidcClientRepository(db: DbClient) {
  return {
    async findRuntimeRecord(clientCode: string): Promise<OidcClientRuntimeDto | null> {
      const [row] = await db.select({
        id: clients.id,
        clientCode: clients.clientCode,
        clientName: clients.clientName,
        status: clients.status,
        isDelete: clients.isDelete,
        oidcEnabled: clients.oidcEnabled,
        oidcConfig: clients.oidcConfig,
        oidcConfigVersion: clients.oidcConfigVersion,
      }).from(clients).where(eq(clients.clientCode, clientCode)).limit(1);
      return row ? OidcClientRuntimeDtoSchema.parse(row) : null;
    },

    async findSecretRecord(clientCode: string): Promise<OidcClientSecretRecord | null> {
      const [row] = await db.select({
        id: clients.id,
        clientCode: clients.clientCode,
        oidcConfigVersion: clients.oidcConfigVersion,
        oidcSecretHash: clients.oidcSecretHash,
        status: clients.status,
        isDelete: clients.isDelete,
        oidcEnabled: clients.oidcEnabled,
        oidcConfig: clients.oidcConfig,
      }).from(clients).where(and(
        eq(clients.clientCode, clientCode),
        eq(clients.status, ClientStatus.Enable),
        eq(clients.isDelete, false),
        eq(clients.oidcEnabled, true),
      )).limit(1);
      if (!row || row.oidcConfig?.clientType !== OidcClientType.Confidential)
        return null;
      return OidcClientSecretRecordSchema.parse(row);
    },
  };
}

export type OidcClientRepository = ReturnType<typeof createOidcClientRepository>;
