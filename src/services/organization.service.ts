import type { Organization } from "../../generated/prisma"
import { env } from "../config"
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
    async getSubOrganizationsByParent(parentCodes: string[]) {
        const organizations = await organizationRepository.getOrganizationsByParentsCode(parentCodes)
        const orgDTOs = organizations.map(o => organizationMapper.toOrganizationDTO(o))
        const compDict = await this.getCompDict()
        const orgVOs = orgDTOs.map(o => organizationMapper.toOrganizationVO(o, compDict[o.orgCode.slice(0, 2)] as Organization))
        return orgVOs
    },
    async getCompDict() {
        const organizations = organizationRepository.getOrganizationsByParentId(-1)
        const companies = (await organizations).filter(o => o.orgType === '分公司')
        return companies.reduce((acc, comp) => { acc[comp.orgCode] = comp; return acc; }, {} as Record<string, Organization>)
    },

    // async getOrganizationsByRole(roleId: number) {
    //     const directOrgs = await organizationRepository.getOrgByRoleId(roleId)
    //     // const subOrgs = directOrgs.filter(e => e.roles.isAllSub)
    //     // const recursiveOrgs = await
    // },
    async setOrganization(orgCode: string, orgName: string, parentCode: string) {
        const [newOrg, parentOrg] = await Promise.all([organizationRepository.getOrgByCode(orgCode),
        organizationRepository.getOrgByCode(parentCode)])
        if (newOrg !== null) {
            throw new CustomError('待创建组织已存在')
        }
        if (parentOrg === null) {
            throw new CustomError('有效父组织不存在')
        }
        const organization = await organizationRepository.setOrganization(orgCode, orgName, parentOrg.level + 1, parentOrg.id)
        const path = `${parentOrg.path}/${organization.id}`
        await Promise.all([organizationRepository.updateOrganizationPath(organization.id, path),
        organizationRepository.updateOrganizationClosure(organization.id, parentOrg.id)])
        return true
    },

    async purveyorRegister(orgCode: string, orgName: string, parentOrg: string) {
        const exisitngOrg = await organizationRepository.getOrgByCode(orgCode)
        if (exisitngOrg !== null) {
            return true
        }
        await this.setOrganization(orgCode, orgName, parentOrg)
        // const parentOrg = await organizationRepository.getOrgByCode('GY')
        // if (parentOrg === null) {
        //     throw new CustomError('有效父组织不存在')
        // }
        // const organization = await organizationRepository.setOrganization(orgCode, orgName, 2, parentOrg.id, '')
        // const path = `${parentOrg.path}/${organization.id}`
        // await organizationRepository.updateOrganizationPath(organization.id, path)
        return true
    }
}