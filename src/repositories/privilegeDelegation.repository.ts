import { PrivilegeDelegationStatus } from "../constants/privilegeDelegation.status";
import { prisma, type PrismaTransaction } from "../libs/database/db";
import type { PrivilegeDelegationEntity } from "../types/privilegeDelegation.entity.type";

export const privilegeDelegationRepository = {
    async getDelegationsByUserAndOrganizationScopeAndPrivilege(
        usernames: string[],
        orgCode: string,
        privCode: string,
        tx: PrismaTransaction = prisma
    ): Promise<PrivilegeDelegationEntity[]> {
        const now = new Date()
        return tx.privilegeDelegation.findMany({
            where: {
                delegationDetails: {
                    some: {
                        privilege: {
                            privilegeCode: privCode
                        },
                    }
                },
                organizationScope: {
                    ancestorClosures: {
                        some: {
                            descendant: {
                                orgCode: orgCode
                            }
                        }
                    }
                },
                delegatorUser: {
                    username: {
                        in: usernames
                    }
                },
                status: PrivilegeDelegationStatus.Enable,
                startTime: {
                    lte: now
                },
                endTime: {
                    gte: now
                }
            },
            include: {
                delegateeUser: true,
                delegatorUser: true
            }
        })
    }
}