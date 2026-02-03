import { employmentAdminMapper } from "../mapper/employment.admin.mapper"
import { employmentRepository } from "../repositories/employment.common.repository"
import type { EmploymentQueryDto } from "../types/employment.common.type"

export const employmentAdminService = {
    async searchEmployments(employmentQueryDto: EmploymentQueryDto) {
        const employments = await employmentRepository.searchEmployments(employmentQueryDto)
        const employmentDtos = employments.map(e => employmentAdminMapper.entityToDto(e)).map(e => employmentAdminMapper.dtoToVo(e))
        return employmentDtos
    },
}