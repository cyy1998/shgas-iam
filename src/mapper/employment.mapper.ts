import type { EmploymentDto, EmploymentEntity } from "../types/employment.type"

export const employmentMapper = {
    entityToDto(employment: EmploymentEntity): EmploymentDto {
        return {
            id: employment.id,
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
            isPrimaryText: employment.isPrimary ? '是' : '否'
        }
    }
}