import type {
  CustomSsoClientRuntimeMutationHeartbeatTimer,
} from "@iam/api-core/custom-sso";
import type { Redis } from "ioredis";
import {
  abortCustomSsoClientRuntimeMutation,
  beginCustomSsoClientRuntimeMutation,
  completeCustomSsoClientRuntimeMutation,
  invalidateCustomSsoClientRuntime,
  startCustomSsoClientRuntimeMutationHeartbeat,
} from "@iam/api-core/custom-sso";

export interface CreateAdminClientCacheOptions {
  redis: Redis;
  mutationFenceTtlMs?: number;
  mutationHeartbeatTimer?:
  CustomSsoClientRuntimeMutationHeartbeatTimer;
}

export function createAdminClientCache(
  options: CreateAdminClientCacheOptions,
) {
  const { redis } = options;
  return {
    async beginRuntimeMutation(
      clientCode: string,
      mutationId: string,
    ) {
      return await beginCustomSsoClientRuntimeMutation(redis, {
        clientCode,
        ...(options.mutationFenceTtlMs === undefined
          ? {}
          : { fenceTtlMs: options.mutationFenceTtlMs }),
        mutationId,
      });
    },
    startRuntimeMutationHeartbeat(
      mutation: Parameters<
        typeof startCustomSsoClientRuntimeMutationHeartbeat
      >[1],
    ) {
      return startCustomSsoClientRuntimeMutationHeartbeat(
        redis,
        mutation,
        {
          ...(options.mutationHeartbeatTimer === undefined
            ? {}
            : { timer: options.mutationHeartbeatTimer }),
        },
      );
    },
    async completeRuntimeMutation(
      mutation: Parameters<
        typeof completeCustomSsoClientRuntimeMutation
      >[1],
    ) {
      return await completeCustomSsoClientRuntimeMutation(
        redis,
        mutation,
      );
    },
    async abortRuntimeMutation(
      mutation: Parameters<
        typeof abortCustomSsoClientRuntimeMutation
      >[1],
    ) {
      return await abortCustomSsoClientRuntimeMutation(redis, mutation);
    },
    async invalidateClient(clientDto: {
      clientCode: string;
      clientSecret: string;
    }) {
      await Promise.all([
        redis.del(`cache:client:code:${clientDto.clientCode}`),
        redis.del(`cache:client:secret:${clientDto.clientSecret}`),
        invalidateCustomSsoClientRuntime(
          redis,
          clientDto.clientCode,
        ),
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
      const customSsoClientCodes = new Set([
        oldClientDto.clientCode,
        newClientDto.clientCode,
      ]);
      await Promise.all([
        redis.del(`cache:client:code:${oldClientDto.clientCode}`),
        redis.del(`cache:client:secret:${oldClientDto.clientSecret}`),
        redis.del(`cache:client:code:${newClientDto.clientCode}`),
        redis.del(`cache:client:secret:${newClientDto.clientSecret}`),
        ...Array.from(customSsoClientCodes, clientCode =>
          invalidateCustomSsoClientRuntime(redis, clientCode)),
      ]);
    },
  };
}

export type AdminClientCache = ReturnType<typeof createAdminClientCache>;
