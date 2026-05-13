import type { PositionCreateDto } from "./position.type";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { PositionHasEmploymentError } from "@iam/api-core/errors/PositionHasEmploymentError";
import db from "@iam/db";
import * as positionRepository from "./position.repository";
import { PositionDtoSchema } from "./position.schema";

export async function setPosition(positionCreateDto: PositionCreateDto) {
  return await db.transaction(async (tx) => {
    const existingPos = await positionRepository.getAnyPositionByCode(positionCreateDto.posCode, tx);
    if (existingPos !== null) {
      throw new CustomError("重复岗位code代码");
    }
    await positionRepository.setPosition(positionCreateDto, tx);
    return true;
  });
}

export async function getPositionDetailByCode(posCode: string) {
  const pos = await positionRepository.getPositionByCode(posCode);
  if (pos === null) {
    throw new CustomError("岗位不存在", 404);
  }
  return PositionDtoSchema.parse(pos);
}

export async function updatePosition(
  posCode: string,
  data: { posName?: string; description?: string | null; status?: number },
) {
  return await db.transaction(async (tx) => {
    const existing = await positionRepository.getPositionByCode(posCode, tx);
    if (existing === null) {
      throw new CustomError("岗位不存在", 404);
    }
    await positionRepository.updatePositionByCode(posCode, data, tx);
    return true;
  });
}

export async function updatePositionStatus(posCode: string, status: number) {
  return await updatePosition(posCode, { status });
}

export async function deletePosition(posCode: string) {
  return await db.transaction(async (tx) => {
    const existing = await positionRepository.getPositionByCode(posCode, tx);
    if (existing === null) {
      throw new CustomError("岗位不存在", 404);
    }
    const employmentCount = await positionRepository.countActiveEmploymentsByPosCode(posCode, tx);
    if (employmentCount > 0) {
      throw new PositionHasEmploymentError();
    }
    await positionRepository.softDeletePositionByCode(posCode, tx);
    return true;
  });
}
