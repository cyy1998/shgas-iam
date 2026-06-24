import type { DbClient } from "@iam/db";
import type { PositionCreateDto, PositionFuzzyQueryDto, PositionUpdateDto } from "./position.type";
import { compactUpdate, firstRow } from "@iam/db/query-utils";
import { employments, positions } from "@iam/db/schema";
import { and, count, eq } from "drizzle-orm";

export function createPositionRepository(db: DbClient) {
  return {
    async getPositionByCode(posCode: string) {
      return await db.query.positions.findFirst({
        where: { posCode, isDelete: false },
      }) ?? null;
    },
    async setPosition(positionCreateDto: PositionCreateDto) {
      await db.insert(positions).values(positionCreateDto);
    },
    async searchPositionsFuzzy(positionAdminQueryDto: PositionFuzzyQueryDto) {
      const text = positionAdminQueryDto.conditions.fuzzyConditions.text;
      return await db.query.positions.findMany({
        where: {
          isDelete: false,
          ...(text !== undefined
            ? {
                OR: [
                  { posName: { ilike: `%${text}%` } },
                  { posCode: { ilike: `%${text}%` } },
                ],
              }
            : {}),
        },
        with: {
          employments: true,
        },
      });
    },
    async updatePositionByCode(posCode: string, data: PositionUpdateDto) {
      return await db
        .update(positions)
        .set(compactUpdate(data))
        .where(and(eq(positions.posCode, posCode), eq(positions.isDelete, false)));
    },
    async softDeletePositionByCode(posCode: string) {
      return await db
        .update(positions)
        .set({ isDelete: true })
        .where(and(eq(positions.posCode, posCode), eq(positions.isDelete, false)));
    },
    async countActiveEmploymentsByPosCode(posCode: string) {
      const rows = await db
        .select({ value: count() })
        .from(employments)
        .innerJoin(positions, eq(employments.posId, positions.id))
        .where(and(
          eq(employments.isDelete, false),
          eq(positions.posCode, posCode),
          eq(positions.isDelete, false),
        ));
      return firstRow(rows)?.value ?? 0;
    },
    async getAnyPositionByCode(posCode: string) {
      return await db.query.positions.findFirst({
        where: { posCode },
      }) ?? null;
    },
  };
}

export type PositionRepository = ReturnType<typeof createPositionRepository>;
