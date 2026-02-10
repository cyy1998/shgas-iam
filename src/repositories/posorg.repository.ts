import { prisma, type PrismaTransaction } from '@database/db'
export const posorgRepository = {
    async getPosOrgById(posId: number, orgId: number, tx: PrismaTransaction = prisma) {
        return await tx.posOrgComposition.findFirst({
            where: {
                posId: posId,
                orgId: orgId
            }
        })
    },
    async setPosOrg(posId: number, orgId: number, tx: PrismaTransaction = prisma) {
        return await tx.posOrgComposition.create({
            data: {
                posId: posId,
                orgId: orgId
            }
        })
    }
}