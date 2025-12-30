import type { PrismaClient } from "@prisma/client/extension"
import { prisma, type PrismaTransaction } from "../libs/database/prisma"

export const clientRepository = {
    async getClientByCode(clientCode: string, tx: PrismaTransaction = prisma) {
        return await tx.client.findFirst({
            where: {
                clientCode: clientCode
            }
        })
    }
}