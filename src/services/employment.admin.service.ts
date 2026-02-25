import type { EmploymentAdminQueryDto } from '@schemas/employment.admin.type';
import { employmentAdminMapper } from '@mapper/employment.admin.mapper';
import { paginate } from '@utils/page.util';
import { employmentRepository } from '../repositories/employment.common.repository';

export const employmentAdminService = {
  async searchEmployments(employmentQueryDto: EmploymentAdminQueryDto) {
    const employments = await employmentRepository.searchEmployments(employmentQueryDto.conditions);
    const employmentDtos = employments.map(e => employmentAdminMapper.entityToDto(e)).map(e => employmentAdminMapper.dtoToVo(e));
    return paginate(employmentDtos, employmentQueryDto);
  },
};
