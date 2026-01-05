import { DelegationStatus } from "../constants/delegation.status"
import { prisma, type PrismaTransaction } from "../libs/database/prisma"

export const delegationRepository = {
    async getDelegationsBydelegatorsAndprivCode(usernames: string[], privCode: string, tx: PrismaTransaction = prisma) {
        await tx.privilegeDelegation.findMany({
            where: {
                status: DelegationStatus.Enable,
                delegatorUser: {
                    username: {
                        in: usernames
                    }
                },
                delegationDetails: {
                    some: {
                        privilege: {
                            privilegeCode: privCode
                        }
                    }
                }
            }
        })
    }
}