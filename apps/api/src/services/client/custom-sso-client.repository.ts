import type { DbClient } from "@iam/db";
import type {
  CustomSsoClientRuntimeDto,
  CustomSsoClientSecretRecord,
} from "@iam/domain/client";
import { CustomSsoClientMode } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import {
  CustomSsoClientRuntimeDtoSchema,
  CustomSsoClientSecretRecordSchema,
} from "@iam/domain/client";
import { and, eq } from "drizzle-orm";

export function createCustomSsoClientRepository(db: DbClient) {
  return {
    async findRuntimeRecord(clientCode: string): Promise<CustomSsoClientRuntimeDto | null> {
      const [row] = await db.select({
        id: clients.id,
        clientCode: clients.clientCode,
        clientName: clients.clientName,
        status: clients.status,
        isDelete: clients.isDelete,
        customSsoEnabled: clients.customSsoEnabled,
        customSsoConfig: clients.customSsoConfig,
        customSsoConfigVersion: clients.customSsoConfigVersion,
      }).from(clients).where(eq(clients.clientCode, clientCode)).limit(1);
      return row ? CustomSsoClientRuntimeDtoSchema.parse(row) : null;
    },

    async findSecretRecord(clientCode: string): Promise<CustomSsoClientSecretRecord | null> {
      const [row] = await db.select({
        id: clients.id,
        clientCode: clients.clientCode,
        status: clients.status,
        isDelete: clients.isDelete,
        customSsoEnabled: clients.customSsoEnabled,
        customSsoConfig: clients.customSsoConfig,
        customSsoSecretHash: clients.customSsoSecretHash,
        customSsoConfigVersion: clients.customSsoConfigVersion,
      }).from(clients).where(and(
        eq(clients.clientCode, clientCode),
        eq(clients.isDelete, false),
        eq(clients.customSsoEnabled, true),
      )).limit(1);
      if (
        !row
        || row.customSsoConfig?.mode !== CustomSsoClientMode.Independent
        || !row.customSsoSecretHash
      ) {
        return null;
      }
      return CustomSsoClientSecretRecordSchema.parse(row);
    },
  };
}

export type CustomSsoClientRepository = ReturnType<
  typeof createCustomSsoClientRepository
>;
