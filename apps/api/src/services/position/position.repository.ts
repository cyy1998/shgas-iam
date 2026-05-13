import type { DbClient } from "@iam/db";
import db from "@iam/db";

export async function getPositionByCode(posCode: string, tx: DbClient = db) {
  return await tx.query.positions.findFirst({
    where: { posCode, isDelete: false },
  }) ?? null;
}
