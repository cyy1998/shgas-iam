import type { GenericClientRecord } from "@iam/domain/client";

export interface ClientCachePort {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
  del: (key: string) => Promise<number>;
}

export interface ClientReaderPort {
  getClientByCode: (
    clientCode: string,
  ) => Promise<GenericClientRecord | null>;
  getClientBySecret: (
    clientSecret: string,
  ) => Promise<GenericClientRecord | null>;
}

export interface ClientServiceDeps {
  redis: ClientCachePort;
  clientRepository: ClientReaderPort;
}
