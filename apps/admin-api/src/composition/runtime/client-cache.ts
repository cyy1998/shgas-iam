import type { Redis } from "ioredis";

export interface CreateAdminClientCacheOptions {
  redis: Redis;
}

export function createAdminClientCache(
  options: CreateAdminClientCacheOptions,
) {
  const { redis } = options;
  return {
    async invalidateClient(clientDto: {
      clientCode: string;
      clientSecret: string;
    }) {
      await Promise.all([
        redis.del(`cache:client:code:${clientDto.clientCode}`),
        redis.del(`cache:client:secret:${clientDto.clientSecret}`),
      ]);
    },
    async invalidateUpdatedClient(
      oldClientDto: {
        clientCode: string;
        clientSecret: string;
      },
      newClientDto: {
        clientCode: string;
        clientSecret: string;
      },
    ) {
      await Promise.all([
        redis.del(`cache:client:code:${oldClientDto.clientCode}`),
        redis.del(`cache:client:secret:${oldClientDto.clientSecret}`),
        redis.del(`cache:client:code:${newClientDto.clientCode}`),
        redis.del(`cache:client:secret:${newClientDto.clientSecret}`),
      ]);
    },
  };
}

export type AdminClientCache = ReturnType<typeof createAdminClientCache>;
