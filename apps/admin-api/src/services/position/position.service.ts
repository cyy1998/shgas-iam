import type { PositionStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import type { PositionCreateDto, PositionUpdateDto } from "./position.type";
import { PositionCodeExistsError } from "@iam/api-core/errors/PositionCodeExistsError";
import { PositionHasEmploymentError } from "@iam/api-core/errors/PositionHasEmploymentError";
import { PositionNotFoundError } from "@iam/api-core/errors/PositionNotFoundError";
import db from "@iam/db";
import * as positionRepository from "./position.repository";
import { PositionDtoSchema } from "./position.schema";

export async function setPosition(positionCreateDto: PositionCreateDto) {
  return await db.transaction(async (tx) => {
    const existingPos = await positionRepository.getAnyPositionByCode(positionCreateDto.posCode, tx);
    if (existingPos !== null) {
      throw new PositionCodeExistsError("重复岗位code代码");
    }
    await positionRepository.setPosition(positionCreateDto, tx);
    return true;
  });
}

export async function getPositionDetailByCode(posCode: string) {
  const pos = await positionRepository.getPositionByCode(posCode);
  if (pos === null) {
    throw new PositionNotFoundError("岗位不存在");
  }
  return PositionDtoSchema.parse(pos);
}

export async function updatePosition(
  posCode: string,
  data: PositionUpdateDto,
) {
  return await db.transaction(async (tx) => {
    const existing = await positionRepository.getPositionByCode(posCode, tx);
    if (existing === null) {
      throw new PositionNotFoundError("岗位不存在");
    }
    await assertRenamedPositionCodeAvailable(posCode, data.posCode, tx);
    await positionRepository.updatePositionByCode(posCode, data, tx);
    return true;
  });
}

async function assertRenamedPositionCodeAvailable(
  currentPosCode: string,
  nextPosCode: string | undefined,
  tx: DbClient,
) {
  if (nextPosCode === undefined || nextPosCode === currentPosCode) {
    return;
  }

  const existingPos = await positionRepository.getAnyPositionByCode(nextPosCode, tx);
  if (existingPos !== null) {
    throw new PositionCodeExistsError("重命名岗位编码失败：岗位编码已存在");
  }
}

export async function updatePositionStatus(posCode: string, status: PositionStatus) {
  return await updatePosition(posCode, { status });
}

export async function deletePosition(posCode: string) {
  return await db.transaction(async (tx) => {
    const existing = await positionRepository.getPositionByCode(posCode, tx);
    if (existing === null) {
      throw new PositionNotFoundError("岗位不存在");
    }
    const employmentCount = await positionRepository.countActiveEmploymentsByPosCode(posCode, tx);
    if (employmentCount > 0) {
      throw new PositionHasEmploymentError();
    }
    await positionRepository.softDeletePositionByCode(posCode, tx);
    return true;
  });
}
