import type { DbClient } from "@iam/db";

export function createPositionRepository(db: DbClient) {
  return {
    getPositionByCode(posCode: string) {
      return getPositionByCode(posCode, db);
    },
  };
}

export type PositionRepository = ReturnType<typeof createPositionRepository>;

async function getPositionByCode(posCode: string, tx: DbClient) {
  return await tx.query.positions.findFirst({
    where: { posCode, isDelete: false },
  }) ?? null;
}
