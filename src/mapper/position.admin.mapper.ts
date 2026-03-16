import type { PositionAdminDto, PositionAdminVo } from "@schemas/position.admin.type";
import type { PositionAdminEntity } from "@schemas/position.entity.type";
import { positionStatusToString } from "@enums/position.status";

export const positionAdminMapper = {
  entityToDto(position: PositionAdminEntity): PositionAdminDto {
    return {
      id: position.id,
      posCode: position.posCode,
      posName: position.posName,
      status: position.status,
      memberNumber: position.employments.length,
      createTime: position.createTime.toISOString(),
      updateTime: position.updateTime.toISOString(),
    };
  },
  dtoToVo(positionDto: PositionAdminDto): PositionAdminVo {
    return {
      ...positionDto,
      statusText: positionStatusToString[positionDto.status],
    };
  },
};
