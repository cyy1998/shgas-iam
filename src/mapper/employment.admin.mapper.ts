import { employmentStatusToString } from "../constants/employment.status"
import type { EmploymentAdminDto, EmploymentAdminVo } from "../types/employment.admin.type"
import type { EmploymentEntity } from "../types/employment.entity.type"

export const employmentAdminMapper = {
    entityToDto(employment: EmploymentEntity): EmploymentAdminDto {
        return {
            id: employment.id,
            userId: employment.user.id,
            username: employment.user.username,
            name: employment.user.name,
            posId: employment.position.id,
            posCode: employment.position.posCode,
            posName: employment.position.posName,
            orgId: employment.deptId,
            orgCode: employment.deptartment.orgCode,
            orgName: employment.deptartment.orgName,
            compId: employment.compId,
            compCode: employment.company.orgCode,
            compName: employment.company.orgName,
            isPrimary: employment.isPrimary,
            status: employment.status,
            startTime: employment.startTime.toISOString(),
            endTime: employment.endTime ? employment.endTime.toISOString() : null,
            createTime: employment.createTime.toISOString(),
            updateTime: employment.updateTime.toISOString()
        }
    },
    dtoToVo(employmentDto: EmploymentAdminDto): EmploymentAdminVo {
        return {
            ...employmentDto,
            statusText: employmentStatusToString[employmentDto.status]
        }
    }
}