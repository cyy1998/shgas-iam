import { createGenericClientCache } from "@iam/client-snapshot/generic-cache";
import { GenericClientRuntimeDtoSchema, toGenericClientRuntimeDto } from "@iam/domain/client";
import type { ClientServiceDeps } from "./client.port";

export function createClientService({ redis, clientRepository }: ClientServiceDeps) {
  return createGenericClientCache({
    redis,
    schema: GenericClientRuntimeDtoSchema,
    source: {
      async getClientByCode(code) {
        const row = await clientRepository.getClientByCode(code);
        return row === null ? null : toGenericClientRuntimeDto(row);
      },
      async getClientBySecret(secret) {
        const row = await clientRepository.getClientBySecret(secret);
        return row === null ? null : toGenericClientRuntimeDto(row);
      },
    },
  });
}

export type ClientService = ReturnType<typeof createClientService>;
