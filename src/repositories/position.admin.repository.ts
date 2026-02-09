import { prisma, type PrismaTransaction } from "../libs/database/db"
import type { PositionAdminQueryDto } from "../types/position.admin.type"

export const positionAdminRepository = {
    async searchPositionsFuzzy(
        positionAdminQueryDto: PositionAdminQueryDto,
        tx: PrismaTransaction = prisma
    ) {
        return await tx.position.findMany({
            where: {
                OR: positionAdminQueryDto.conditions.fuzzyConditions.text !== undefined ? [
                    {
                        posName: {
                            contains: positionAdminQueryDto.conditions.fuzzyConditions.text,
                        }
                    }, {
                        posCode: {
                            contains: positionAdminQueryDto.conditions.fuzzyConditions.text,
                        }
                    }
                ] : undefined,
                isDelete: false
            },
            include: {
                employments: true
            }
        })
    },
}