import type { Position } from "../../generated/prisma"
import { positionStatusToString } from "../constants/position.status"
import type { PositionAdminDto, PositionAdminVo } from "../types/position.admin.type"

export const positionAdminMapper = {
    entityToDto(position: Position): PositionAdminDto {
        return {
            id: position.id,
            posCode: position.posCode,
            posName: position.posName,
            status: position.status,
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