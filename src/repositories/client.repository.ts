import type { PrismaClient } from "@prisma/client/extension"
import { prisma, type PrismaTransaction } from "../libs/database/db"
import type { ClientDto, ClientInputDto } from "../types/client.type"

export const clientRepository = {
    async getClientByCode(clientCode: string, tx: PrismaTransaction = prisma) {
        return await tx.client.findFirst({
            where: {
                clientCode: clientCode
            }
        })
    },
    async updateClient(clientDto: ClientInputDto, tx: PrismaTransaction = prisma) {
        return await tx.client.update({
            data: clientDto,
            where: {
                id: clientDto.id
            }
        })
    }
}