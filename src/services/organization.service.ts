import { CustomError } from "../errors/CustomError"
import { organizationMapper } from "../mapper/organization.mapper"
import { organizationRepository } from "../repositories/organization.repository"

export const organizationService = {
    async getFormalOrganizationsByCode(orgCode: string, orgLevel: number) {
        const organizations = await organizationRepository.searchFormalOrganizations(orgCode, orgLevel)
        const orgDTOs = organizations.map(o => organizationMapper.toOrganizationDTO(o))
        return orgDTOs
    },

    async getOrganizationsByCode(orgCode: string, orgLevel: number) {
        const organizations = await organizationRepository.searchOrganizations(orgCode, orgLevel)
        const orgDTOs = organizations.map(o => organizationMapper.toOrganizationDTO(o))
        return orgDTOs
    },

    async getOrganizationsByRole(roleId: number) {
        const directOrgs = await organizationRepository.getOrgByRoleId(roleId)
        // const subOrgs = directOrgs.filter(e => e.roles.isAllSub)
        // const recursiveOrgs = await
    },

    async purveyorRegister(orgCode: string, orgName: string) {
        const exisitngOrg = await organizationRepository.getOrgByCode(orgCode)
        if (exisitngOrg !== null) {
            return true
        }
        const parentOrg = await organizationRepository.getOrgByCode('GY')
        if (parentOrg === null) {
            throw new CustomError('有效父组织不存在')
        }
        const organization = await organizationRepository.setOrganization(orgCode, orgName, 2, parentOrg.id, '')
        const path = `${parentOrg.path}/${organization.id}`
        await organizationRepository.updateOrganizationPath(organization.id, path)
        return true
    }
}