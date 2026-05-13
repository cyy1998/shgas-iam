import type { ClientCreateDto, ClientDto, ClientInputDto } from "./client.type";
import redis from "@admin-api/lib/clients/redis";
import * as clientRepository from "@admin-api/services/client/client.repository";
import { ClientDtoSchema } from "@admin-api/services/client/client.schema";
import db from "@iam/db";

async function setClientCache(clientDto: ClientDto) {
  await Promise.all([
    redis.set(`cache:client:code:${clientDto.clientCode}`, JSON.stringify(clientDto)),
    redis.set(`cache:client:secret:${clientDto.clientSecret}`, JSON.stringify(clientDto)),
  ]);
}

export async function createClient(clientDto: ClientCreateDto) {
  return await db.transaction(async (tx) => {
    const client = await clientRepository.createClient(clientDto, tx);
    const createdClientDto = ClientDtoSchema.parse(client);
    await setClientCache(createdClientDto);
    return createdClientDto;
  });
}

export async function updateClient(clientDto: ClientInputDto) {
  return await db.transaction(async (tx) => {
    const client = await clientRepository.updateClient(clientDto, tx);
    const updatedClientDto = ClientDtoSchema.parse(client);
    await setClientCache(updatedClientDto);
    return updatedClientDto;
  });
}
