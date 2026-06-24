import type { DbClient } from "@iam/db";

export function createPositionRepository(db: DbClient) {
  return {
    async getPositionByCode(posCode: string) {
      return await db.query.positions.findFirst({
        where: { posCode, isDelete: false },
      }) ?? null;
    },
  };
}

export type PositionRepository = ReturnType<typeof createPositionRepository>;
