import { prisma, type PrismaTransaction } from '../libs/database/prisma'

export const positionRepository = {
    async getPositionByCode(posCode: string, tx: PrismaTransaction = prisma) {
        return await prisma.position.findFirst({
            where: {
                posCode: posCode,
            }
        })
    },
    async getPositionById(posId: number, tx: PrismaTransaction = prisma) {
        return await prisma.position.findFirst({
            where: {
                id: posId,
            }
        })
    }
}