import { prisma } from '../libs/database/prisma'
export const posorgRepository = {
    async getPosOrgById(posId: number, orgId: number) {
        return await prisma.posOrgComposition.findFirst({
            where: {
                posId: posId,
                orgId: orgId
            }
        })
    },
    async setPosOrg(posId: number, orgId: number) {
        return await prisma.posOrgComposition.create({
            data: {
                posId: posId,
                orgId: orgId
            }
        })
    }
}