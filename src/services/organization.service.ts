import { PURVEYOR_ORG_PRFFIX, ServiceStatusCode } from "../constant"
import { organizationMapper } from "../mapper/organization.mapper"
import { organizationRepository } from "../repositories/organization.repository"

export const organizationService = {
    async searchFormalOrganization(orgCode: string, orgLevel: number) {
        const organizations = await organizationRepository.searchFormalOrganization(orgCode, orgLevel)
        const orgDTOs = organizations.map(o => organizationMapper.toOrganizationDTO(o))
        return {
            code: ServiceStatusCode.Success,
            data: orgDTOs,
            message: 'success'
        }
    },
    async purveyorRegister(orgCode: string, orgName: string) {
        const exisitngOrg = await organizationRepository.getOrganizationByCode(orgCode)
        if (exisitngOrg !== null) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '相同组织已存在'
            }
        }
        const parentOrg = await organizationRepository.getOrganizationByCode(PURVEYOR_ORG_PRFFIX)
        if (parentOrg === null) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '有效父组织不存在'
            }
        }
        const organization = await organizationRepository.setOrganization(orgCode, orgName, 2, parentOrg.id)
        if (organization === null) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '记录创建失败'
            }
        }
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }
    }
}