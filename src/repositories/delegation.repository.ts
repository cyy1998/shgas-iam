import { prisma } from "../libs/database/prisma"

export const delegationRepository = {
    async getDelegationByPrivilegeCode(privilegeCode: string) {
        return await prisma.privilegeDelegation.findMany({
            where: {
                delegationDetails: {
                    some: {

                    }
                }
            }
        })
    },
}