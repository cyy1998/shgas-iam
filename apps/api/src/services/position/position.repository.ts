import type { DbClient } from "@api/db";
import type { PositionCreateDto, PositionFuzzyQueryDto } from "./position.type";
import db from "@api/db";
import { compactUpdate, firstRow } from "@api/db/query-utils";
import { employments, positions } from "@api/db/schema";
import { and, count, eq } from "drizzle-orm";

export async function getPositionByCode(posCode: string, tx: DbClient = db) {
  return await tx.query.positions.findFirst({
    where: { posCode, isDelete: false },
  }) ?? null;
}

export async function setPosition(positionCreateDto: PositionCreateDto, tx: DbClient = db) {
  await tx.insert(positions).values(positionCreateDto);
}

export async function searchPositionsFuzzy(
  positionAdminQueryDto: PositionFuzzyQueryDto,
  tx: DbClient = db,
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

export async function updatePositionByCode(
  posCode: string,
  data: { posName?: string; description?: string | null; status?: number },
  tx: DbClient = db,
) {
  return await tx
    .update(positions)
    .set(compactUpdate(data))
    .where(and(eq(positions.posCode, posCode), eq(positions.isDelete, false)));
}

export async function softDeletePositionByCode(
  posCode: string,
  tx: DbClient = db,
) {
  return await tx
    .update(positions)
    .set({ isDelete: true })
    .where(and(eq(positions.posCode, posCode), eq(positions.isDelete, false)));
}

export async function countActiveEmploymentsByPosCode(
  posCode: string,
  tx: DbClient = db,
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

export async function getAnyPositionByCode(posCode: string, tx: DbClient = db) {
  return await tx.query.positions.findFirst({
    where: { posCode },
  }) ?? null;
}
