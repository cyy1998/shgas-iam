import type { GenericClientCacheRedis } from "@iam/client-snapshot/generic-cache";
import type { GenericClientRecord } from "@iam/domain/client";

export interface ClientReaderPort {
  getClientByCode: (clientCode: string) => Promise<GenericClientRecord | null>;
  getClientBySecret: (clientSecret: string) => Promise<GenericClientRecord | null>;
}

export interface ClientServiceDeps {
  redis: GenericClientCacheRedis;
  clientRepository: ClientReaderPort;
}
