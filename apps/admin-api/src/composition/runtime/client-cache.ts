import type {
  ClientTrafficGateMutationHeartbeatTimer,
} from "@iam/api-core/client-traffic-gate";
import type {
  CustomSsoClientRuntimeMutationHeartbeatTimer,
} from "@iam/api-core/custom-sso";
import type { Redis } from "ioredis";
import {
  abortClientTrafficGateMutation,
  beginClientTrafficGateMutation,
  invalidateClientTrafficGate,
  publishClientTrafficGateMutation,
  startClientTrafficGateMutationHeartbeat,
} from "@iam/api-core/client-traffic-gate";
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
  trafficGateMutationFenceTtlMs?: number;
  trafficGateMutationHeartbeatTimer?:
  ClientTrafficGateMutationHeartbeatTimer;
}

export function createAdminClientCache(
  options: CreateAdminClientCacheOptions,
) {
  const { redis } = options;
  return {
    async beginTrafficGateMutation(
      clientCode: string,
      mutationId: string,
    ) {
      return await beginClientTrafficGateMutation(redis, {
        clientCode,
        mutationId,
        ...(options.trafficGateMutationFenceTtlMs === undefined
          ? {}
          : { fenceTtlMs: options.trafficGateMutationFenceTtlMs }),
      });
    },
    startTrafficGateMutationHeartbeat(
      mutation: Parameters<
        typeof startClientTrafficGateMutationHeartbeat
      >[1],
    ) {
      return startClientTrafficGateMutationHeartbeat(redis, mutation, {
        ...(options.trafficGateMutationHeartbeatTimer === undefined
          ? {}
          : { timer: options.trafficGateMutationHeartbeatTimer }),
      });
    },
    async publishTrafficGateMutation(
      mutation: Parameters<
        typeof publishClientTrafficGateMutation
      >[1],
      status: Parameters<
        typeof publishClientTrafficGateMutation
      >[2],
    ) {
      return await publishClientTrafficGateMutation(redis, mutation, status);
    },
    async abortTrafficGateMutation(
      mutation: Parameters<
        typeof abortClientTrafficGateMutation
      >[1],
    ) {
      return await abortClientTrafficGateMutation(redis, mutation);
    },
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
        invalidateClientTrafficGate(redis, clientDto.clientCode),
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
