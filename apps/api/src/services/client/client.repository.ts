import type { ClientCreateDto, ClientInputDto } from "./client.type";
import type { PrismaTransaction } from "@/db";
import { prisma } from "@/db";

export async function getClientByCode(clientCode: string, tx: PrismaTransaction = prisma) {
  return await tx.client.findFirst({
    where: {
      clientCode,
    },
  });
}
export async function getClientBySecret(clientSecret: string, tx: PrismaTransaction = prisma) {
  return await tx.client.findFirst({
    where: {
      clientSecret,
    },
  });
}
export async function createClient(clientDto: ClientCreateDto, tx: PrismaTransaction = prisma) {
  return await tx.client.create({
    data: clientDto,
  });
}
export async function updateClient(clientDto: ClientInputDto, tx: PrismaTransaction = prisma) {
  return await tx.client.update({
    data: clientDto,
    where: {
      id: clientDto.id,
    },
  });
}
