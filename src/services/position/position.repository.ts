import type { PositionCreateDto, PositionFuzzyQueryDto } from "./position.type";
import type { PrismaTransaction } from "@/db";
import { prisma } from "@/db";

export async function getPositionByCode(posCode: string, tx: PrismaTransaction = prisma) {
  return await tx.position.findFirst({
    where: {
      posCode,
    },
  });
}
export async function getPositionById(posId: number, tx: PrismaTransaction = prisma) {
  return await tx.position.findFirst({
    where: {
      id: posId,
    },
  });
}

export async function setPosition(positionCreateDto: PositionCreateDto, tx: PrismaTransaction = prisma) {
  await tx.position.create({
    data: positionCreateDto,
  });
}

export async function searchPositionsFuzzy(
  positionAdminQueryDto: PositionFuzzyQueryDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.position.findMany({
    where: {
      OR: positionAdminQueryDto.conditions.fuzzyConditions.text !== undefined
        ? [
            {
              posName: {
                contains: positionAdminQueryDto.conditions.fuzzyConditions.text,
              },
            },
            {
              posCode: {
                contains: positionAdminQueryDto.conditions.fuzzyConditions.text,
              },
            },
          ]
        : undefined,
      isDelete: false,
    },
    include: {
      employments: true,
    },
  });
}
