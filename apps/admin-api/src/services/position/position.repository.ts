import type { DbClient } from "@iam/db";
import type { PositionCreateDto, PositionFuzzyQueryDto, PositionUpdateDto } from "./position.type";
import { compactUpdate, firstRow } from "@iam/db/query-utils";
import { employments, positions } from "@iam/db/schema";
import { and, count, eq } from "drizzle-orm";

export function createPositionRepository(db: DbClient) {
  return {
    getPositionByCode(posCode: string) {
      return getPositionByCode(posCode, db);
    },
    setPosition(positionCreateDto: PositionCreateDto) {
      return setPosition(positionCreateDto, db);
    },
    searchPositionsFuzzy(positionAdminQueryDto: PositionFuzzyQueryDto) {
      return searchPositionsFuzzy(positionAdminQueryDto, db);
    },
    updatePositionByCode(posCode: string, data: PositionUpdateDto) {
      return updatePositionByCode(posCode, data, db);
    },
    softDeletePositionByCode(posCode: string) {
      return softDeletePositionByCode(posCode, db);
    },
    countActiveEmploymentsByPosCode(posCode: string) {
      return countActiveEmploymentsByPosCode(posCode, db);
    },
    getAnyPositionByCode(posCode: string) {
      return getAnyPositionByCode(posCode, db);
    },
  };
}

export type PositionRepository = ReturnType<typeof createPositionRepository>;

async function getPositionByCode(posCode: string, tx: DbClient) {
  return await tx.query.positions.findFirst({
    where: { posCode, isDelete: false },
  }) ?? null;
}

async function setPosition(positionCreateDto: PositionCreateDto, tx: DbClient) {
  await tx.insert(positions).values(positionCreateDto);
}

async function searchPositionsFuzzy(
  positionAdminQueryDto: PositionFuzzyQueryDto,
  tx: DbClient,
) {
  const text = positionAdminQueryDto.conditions.fuzzyConditions.text;
  return await tx.query.positions.findMany({
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
}

async function updatePositionByCode(
  posCode: string,
  data: PositionUpdateDto,
  tx: DbClient,
) {
  return await tx
    .update(positions)
    .set(compactUpdate(data))
    .where(and(eq(positions.posCode, posCode), eq(positions.isDelete, false)));
}

async function softDeletePositionByCode(
  posCode: string,
  tx: DbClient,
) {
  return await tx
    .update(positions)
    .set({ isDelete: true })
    .where(and(eq(positions.posCode, posCode), eq(positions.isDelete, false)));
}

async function countActiveEmploymentsByPosCode(
  posCode: string,
  tx: DbClient,
) {
  const rows = await tx
    .select({ value: count() })
    .from(employments)
    .innerJoin(positions, eq(employments.posId, positions.id))
    .where(and(
      eq(employments.isDelete, false),
      eq(positions.posCode, posCode),
      eq(positions.isDelete, false),
    ));
  return firstRow(rows)?.value ?? 0;
}

async function getAnyPositionByCode(posCode: string, tx: DbClient) {
  return await tx.query.positions.findFirst({
    where: { posCode },
  }) ?? null;
}
