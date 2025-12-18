import { ServiceStatusCode } from "../constants/service.status"
import { organizationMapper } from "../mapper/organization.mapper"
import { organizationRepository } from "../repositories/organization.repository"

export const organizationService = {
    async searchFormalOrganizations(orgCode: string, orgLevel: number) {
        const organizations = await organizationRepository.searchFormalOrganizations(orgCode, orgLevel)
        const orgDTOs = organizations.map(o => organizationMapper.toOrganizationDTO(o))
        return {
            code: ServiceStatusCode.Success,
            data: orgDTOs,
            message: 'success'
        }
    },
    async searchOrganizations(orgCode: string, orgLevel: number) {
        const organizations = await organizationRepository.searchOrganizations(orgCode, orgLevel)
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
                code: ServiceStatusCode.Success,
                data: {},
                message: 'success'
            }
        }
        const parentOrg = await organizationRepository.getOrganizationByCode('GY')
        if (parentOrg === null) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '有效父组织不存在'
            }
        }
        const organization = await organizationRepository.setOrganization(orgCode, orgName, 2, parentOrg.id, '')
        const path = `${parentOrg.path}/${organization.id}`
        await organizationRepository.updateOrganizationPath(organization.id, path)
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