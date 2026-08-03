import type { GenericClientRuntimeDto } from "@iam/domain/client";
import type { ClientServiceDeps } from "./client.port";
import { reviveIsoDates } from "@iam/api-core/utils";
import {
  GenericClientRuntimeDtoSchema,
  toGenericClientRuntimeDto,
} from "@iam/domain/client";
import { ZodError } from "zod";

export function createClientService(deps: ClientServiceDeps) {
  async function setClientCache(clientDto: GenericClientRuntimeDto) {
    await Promise.all([
      deps.redis.set(`cache:client:code:${clientDto.clientCode}`, JSON.stringify(clientDto)),
      deps.redis.set(`cache:client:secret:${clientDto.clientSecret}`, JSON.stringify(clientDto)),
    ]);
  }

  async function getClientFromCache(
    key: string,
    type: string,
  ): Promise<GenericClientRuntimeDto | null> {
    const cacheString = await deps.redis.get(`cache:client:${type}:${key}`);
    if (cacheString !== null) {
      try {
        const cacheClient = GenericClientRuntimeDtoSchema.parse(
          JSON.parse(cacheString, reviveIsoDates),
        );
        return cacheClient;
      }
      catch (err) {
        if (err instanceof ZodError) {
          await deps.redis.del(`cache:client:${type}:${key}`);
          return null;
        }
        else {
          throw err;
        }
      }
    }
    return null;
  }

  async function getClientByCode(
    clientCode: string,
  ): Promise<GenericClientRuntimeDto | null> {
    const cachedClient = await getClientFromCache(clientCode, "code");
    if (cachedClient !== null) {
      return cachedClient;
    }
    const client = await deps.clientRepository.getClientByCode(clientCode);
    if (client === null) {
      return null;
    }
    const clientDto = toGenericClientRuntimeDto(client);
    await setClientCache(clientDto);
    return clientDto;
  }

  async function getClientBySecret(
    clientSecret: string,
  ): Promise<GenericClientRuntimeDto | null> {
    const cachedClient = await getClientFromCache(clientSecret, "secret");
    if (cachedClient !== null) {
      return cachedClient;
    }
    const client = await deps.clientRepository.getClientBySecret(clientSecret);
    if (client === null) {
      return null;
    }
    const clientDto = toGenericClientRuntimeDto(client);
    await setClientCache(clientDto);
    return clientDto;
  }

  return {
    getClientByCode,
    getClientBySecret,
  };
}

export type ClientService = ReturnType<typeof createClientService>;
