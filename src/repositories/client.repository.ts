import type { PrismaClient } from "@prisma/client/extension"
import { prisma, type PrismaTransaction } from "../libs/database/prisma"
import type { ClientDto } from "../types/client.type"

export const clientRepository = {
    async getClientByCode(clientCode: string, tx: PrismaTransaction = prisma) {
        return await tx.client.findFirst({
            where: {
                clientCode: clientCode
            }
        })
    },
    async updateClient(clientDto: ClientDto, tx: PrismaTransaction = prisma) {
        return await tx.client.update({
            data: {
                status: clientDto.status,
                url: clientDto.url,
                clientName: clientDto.clientName
            },
            where: {
                id: clientDto.id
            }
        })
    }
}