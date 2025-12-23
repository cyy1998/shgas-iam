import { prisma } from "../extensions"
export const posorgRepository = {
    async getPosOrgById(posId: number, orgId: number) {
        return await prisma.posOrgComposition.findFirst({
            where: {
                posId: posId,
                orgId: orgId
            }
        })
    }
}