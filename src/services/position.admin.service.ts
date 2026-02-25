import type { PositionAdminQueryDto } from '@schemas/position.admin.type';
import { positionAdminMapper } from '@mapper/position.admin.mapper';
import { paginate } from '@utils/page.util';
import { positionAdminRepository } from '../repositories/position.admin.repository';

export const positionAdminService = {
  async searchPositionsFuzzy(positionPageQuery: PositionAdminQueryDto) {
    const positions = await positionAdminRepository.searchPositionsFuzzy(positionPageQuery);
    const positionDtos = positions.map(p => positionAdminMapper.entityToDto(p))
      .map(p => positionAdminMapper.dtoToVo(p));
    return paginate(positionDtos, positionPageQuery);
  },
};
