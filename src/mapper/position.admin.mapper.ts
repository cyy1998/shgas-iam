import type { Position } from "@database/client"
import { positionStatusToString } from "../constants/position.status"
import type { PositionAdminDto, PositionAdminVo } from "../types/position.admin.type"
import type { PositionAdminEntity } from "../types/position.entity.type"

export const positionAdminMapper = {
    entityToDto(position: PositionAdminEntity): PositionAdminDto {
        return {
            id: position.id,
            posCode: position.posCode,
            posName: position.posName,
            status: position.status,
            memberNumber: position.employments.length,
            createTime: position.createTime.toISOString(),
            updateTime: position.updateTime.toISOString()
        }
    },
    dtoToVo(positionDto: PositionAdminDto): PositionAdminVo {
        return {
            ...positionDto,
            statusText: positionStatusToString[positionDto.status]
        }
    }
}