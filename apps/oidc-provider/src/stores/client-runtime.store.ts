import type { OidcClientRuntimeDto } from "@iam/domain/client";
import type { Redis } from "ioredis";
import type { OidcClientRuntimeMetadata } from "../provider/client-runtime-metadata.ts";
import { oidcClientRuntimeCacheKey } from "@iam/api-core/oidc";
import { toOidcClientRuntimeMetadata } from "../provider/client-runtime-metadata.ts";
import { isOidcClientAvailable } from "../repositories/availability.ts";

export function createOidcClientRuntimeCache(redis: Redis, cacheTtlSeconds: number) {
  return {
    async get(clientCode: string): Promise<OidcClientRuntimeMetadata | null> {
      const cacheKey = oidcClientRuntimeCacheKey(clientCode);
      const cached = await redis.get(cacheKey);
      if (!cached)
        return null;
      try {
        return JSON.parse(cached) as OidcClientRuntimeMetadata;
      }
      catch {
        await redis.del(cacheKey);
        return null;
      }
    },
    async set(clientCode: string, metadata: OidcClientRuntimeMetadata) {
      await redis.set(oidcClientRuntimeCacheKey(clientCode), JSON.stringify(metadata), "EX", cacheTtlSeconds);
    },
    async delete(clientCode: string) {
      await redis.del(oidcClientRuntimeCacheKey(clientCode));
    },
  };
}

export type OidcClientRuntimeCache = ReturnType<typeof createOidcClientRuntimeCache>;

export interface OidcClientRuntimeRecordReader {
  findRuntimeRecord: (clientCode: string) => Promise<OidcClientRuntimeDto | null>;
}

export interface CreateOidcClientRuntimeStoreDeps {
  repository: OidcClientRuntimeRecordReader;
  cache: OidcClientRuntimeCache;
}

export function createOidcClientRuntimeStore(deps: CreateOidcClientRuntimeStoreDeps) {
  async function findRuntime(clientCode: string): Promise<OidcClientRuntimeMetadata | null> {
    const cached = await deps.cache.get(clientCode);
    if (cached)
      return cached;

    const client = await deps.repository.findRuntimeRecord(clientCode);
    if (!client || !isOidcClientAvailable(client))
      return null;

    const metadata = toOidcClientRuntimeMetadata(client);
    await deps.cache.set(clientCode, metadata);
    return metadata;
  }

  return {
    findRuntime,
    async findActiveVersion(clientCode: string) {
      return (await findRuntime(clientCode))?.oidc_config_version ?? null;
    },
  };
}

export type OidcClientRuntimeStore = ReturnType<typeof createOidcClientRuntimeStore>;
