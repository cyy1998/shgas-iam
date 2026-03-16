import type { ClientInputDto } from "./client.type";
import type { PrismaTransaction } from "@/db";
import { prisma } from "@/db";

export async function getClientByCode(clientCode: string, tx: PrismaTransaction = prisma) {
  return await tx.client.findFirst({
    where: {
      clientCode,
    },
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
