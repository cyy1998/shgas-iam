import type { PositionCreateDto, PositionFuzzyQueryDto } from "./position.type";
import db from "@api/db";
import { CustomError } from "@api/errors/CustomError";
import { PositionHasEmploymentError } from "@api/errors/PositionHasEmploymentError";
import { paginate } from "@api/utils/page.util";
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

export async function setPositions(positionCreateDtos: PositionCreateDto[]) {
  return await db.transaction(async (tx) => {
    const existingPositions = await positionRepository.searchPositions({
      posCodes: positionCreateDtos.map(e => e.posCode),
    }, tx);
    if (existingPositions.length !== 0) {
      throw new CustomError("重复岗位code代码");
    }
    await positionRepository.setPositions(positionCreateDtos, tx);
    return true;
  });
}

export async function searchPositionsFuzzy(positionPaginationQuery: PositionFuzzyQueryDto) {
  const positions = await positionRepository.searchPositionsFuzzy(positionPaginationQuery);
  const positionDtos = positions.map(p => PositionDtoSchema.parse(p));
  return paginate(positionDtos, positionPaginationQuery);
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
