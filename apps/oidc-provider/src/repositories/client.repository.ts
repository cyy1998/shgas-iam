import type { Redis } from "ioredis";
import type { OidcClientRuntimeMetadata } from "./client-metadata.ts";
import { oidcClientRuntimeCacheKey } from "@iam/api-core/oidc";
import { verifySecret } from "@iam/api-core/security";
import {
  ClientStatus,
  OidcClientType,
} from "@iam/contracts";
import { db } from "@iam/db";
import { clients } from "@iam/db/schema";
import { OidcClientRuntimeDtoSchema, OidcClientSecretRecordSchema } from "@iam/domain/client";
import { and, eq } from "drizzle-orm";
import { isOidcClientAvailable } from "./availability.ts";
import { toOidcClientRuntimeMetadata } from "./client-metadata.ts";

export class OidcClientRepository {
  constructor(
    private readonly redis: Redis,
    private readonly cacheTtlSeconds: number,
  ) {}

  async findRuntime(clientCode: string): Promise<OidcClientRuntimeMetadata | null> {
    const cacheKey = oidcClientRuntimeCacheKey(clientCode);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as OidcClientRuntimeMetadata;
      }
      catch {
        await this.redis.del(cacheKey);
      }
    }

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
    if (!row)
      return null;

    const client = OidcClientRuntimeDtoSchema.parse(row);
    if (!isOidcClientAvailable(client))
      return null;

    const metadata = toOidcClientRuntimeMetadata(client);

    await this.redis.set(cacheKey, JSON.stringify(metadata), "EX", this.cacheTtlSeconds);
    return metadata;
  }

  async findActiveVersion(clientCode: string) {
    return (await this.findRuntime(clientCode))?.oidc_config_version ?? null;
  }
}

export class OidcClientSecretRepository {
  async verify(clientCode: string, secret: string) {
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
      return false;

    const record = OidcClientSecretRecordSchema.parse(row);
    return record.oidcSecretHash ? await verifySecret(secret, record.oidcSecretHash) : false;
  }
}
