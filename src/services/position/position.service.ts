import type { PositionCreateDto, PositionFuzzyQueryDto } from "./position.type";
import { prisma } from "@/db";
import { CustomError } from "@/errors/CustomError";
import { paginate } from "@/utils/page.util";
import * as positionRepository from "./position.repository";
import { PositionDtoSchema } from "./position.schema";

export async function setPosition(positionCreateDto: PositionCreateDto) {
  return await prisma.$transaction(async (tx) => {
    const existingPos = await positionRepository.getPositionByCode(positionCreateDto.posCode, tx);
    if (existingPos !== null) {
      throw new CustomError("重复角色code代码");
    }
    await positionRepository.setPosition(positionCreateDto, tx);
    return true;
  });
}

export async function searchPositionsFuzzy(positionPaginationQuery: PositionFuzzyQueryDto) {
  const positions = await positionRepository.searchPositionsFuzzy(positionPaginationQuery);
  const positionDtos = positions.map(p => PositionDtoSchema.parse(p));
  return paginate(positionDtos, positionPaginationQuery);
}
