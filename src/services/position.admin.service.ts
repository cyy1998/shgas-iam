import { positionAdminMapper } from "../mapper/position.admin.mapper"
import { positionAdminRepository } from "../repositories/position.admin.repository"
import type { PositionAdminQueryDto } from "../types/position.admin.type"
import { paginate } from "../utils/page.util"

export const positionAdminService = {
    async searchPositionsFuzzy(positionPageQuery: PositionAdminQueryDto) {
        const positions = await positionAdminRepository.searchPositionsFuzzy(positionPageQuery)
        const positionDtos = positions.map(p => positionAdminMapper.entityToDto(p))
            .map(p => positionAdminMapper.dtoToVo(p))
        return paginate(positionDtos, positionPageQuery)
    },
}