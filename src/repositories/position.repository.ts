import { prisma } from "../extensions"

export const positionRepository = {
    async getPositionByCode(posCode: string) {
        return await prisma.position.findFirst({
            where: {
                posCode: posCode,
            }
        })
    },
    async getPositionById(posId: number) {
        return await prisma.position.findFirst({
            where: {
                id: posId,
            }
        })
    }
}