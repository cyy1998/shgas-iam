import { prisma, type PrismaTransaction } from "../libs/database/prisma"
import type { UserAdminQueryDto } from "../types/user.admin.type"
import type { UserCreateDto } from "../types/user.common.type"

export const userAdminRepository = {
    async getUserByUsername(username: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findFirst({
            where: {
                username: username,
                isDelete: false
            }
        })
    },
    async searchUsersFuzzy(
        userAdminSearchDto: UserAdminQueryDto,
        tx: PrismaTransaction = prisma
    ) {
        return await tx.user.findMany({
            where: {
                OR: userAdminSearchDto.conditions.fuzzyConditions.text !== undefined ? [
                    {
                        username: {
                            contains: userAdminSearchDto.conditions.fuzzyConditions.text,
                        }
                    }, {
                        name: {
                            contains: userAdminSearchDto.conditions.fuzzyConditions.text,
                        }
                    }, {
                        mobilePhone: {
                            contains: userAdminSearchDto.conditions.fuzzyConditions.text,
                        }
                    },
                    {
                        wxId: {
                            contains: userAdminSearchDto.conditions.fuzzyConditions.text
                        }
                    },
                ] : undefined,
                userType: {
                    in: userAdminSearchDto.conditions.exactConditions.userTypes
                },
                username: {
                    in: userAdminSearchDto.conditions.exactConditions.usernames
                },
                mobilePhone: {
                    in: userAdminSearchDto.conditions.exactConditions.phones
                },
                wxId: {
                    in: userAdminSearchDto.conditions.exactConditions.wxIds
                },
                isDelete: false
            }
        })
    },
    async setUsers(userCreateDtos: UserCreateDto[], tx: PrismaTransaction = prisma) {
        return await tx.user.createMany({
            data: userCreateDtos
        })
    }
}