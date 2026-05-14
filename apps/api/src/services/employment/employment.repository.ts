import type { DbClient } from "@iam/db";
import { EmploymentStatus } from "@iam/contracts";
import db from "@iam/db";
import { firstRow } from "@iam/db/query-utils";
import {
  employments,
} from "@iam/db/schema";

const employmentRelations = {
  user: true,
  department: true,
  company: true,
  position: true,
} as const;

export async function getEmploymentsByUserId(userId: number, tx: DbClient = db) {
  return await tx.query.employments.findMany({
    where: {
      userId,
      status: EmploymentStatus.Enable,
      isDelete: false,
    },
    with: employmentRelations,
  });
}

export async function getEmploymentByUserOrgPosId(
  userId: number,
  orgId: number,
  posId: number,
  tx: DbClient = db,
) {
  return await tx.query.employments.findFirst({
    where: {
      userId,
      orgId,
      posId,
      status: EmploymentStatus.Enable,
      isDelete: false,
    },
    with: employmentRelations,
  }) ?? null;
}

export async function setEmployment(
  userId: number,
  posId: number,
  orgId: number,
  compId: number,
  tx: DbClient = db,
) {
  return firstRow(await tx.insert(employments).values({
    userId,
    posId,
    orgId,
    compId,
  }).returning())!;
}
