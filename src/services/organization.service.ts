import type { Organization } from "../../generated/prisma"
import { env } from "../config"
import { CustomError } from "../errors/CustomError"
import { prisma } from "../libs/database/prisma"
import { organizationMapper } from "../mapper/organization.mapper"
import { organizationRepository } from "../repositories/organization.repository"

export const organizationService = {
    async getFormalOrganizationsByCode(orgCode: string, orgLevel: number) {
        const organizations = await organizationRepository.searchFormalOrganizations(orgCode, orgLevel)
        const orgDtos = organizations.map(o => organizationMapper.entityToDto(o))
        return orgDtos
    },
    async getTopFormalOrganizations() {
        const organizations = await organizationRepository.getTopFormalOrganizations()
        const orgDtos = organizations.map(o => organizationMapper.entityToDto(o))
        return orgDtos
    },

    async getOrganizationsByCode(orgCode: string, orgLevel: number) {
        const organizations = await organizationRepository.searchOrganizations(orgCode, orgLevel)
        const orgDtos = organizations.map(o => organizationMapper.entityToDto(o))
        return orgDtos
    },
    async getSubOrganizationsByParent(parentCodes: string[]) {
        const organizations = await organizationRepository.getOrganizationsByParentsCode(parentCodes)
        const orgDTOs = organizations.map(o => organizationMapper.entityToDto(o))
        const compDict = await this.getCompDict()
        const orgVOs = orgDTOs.map(o => organizationMapper.dtoToVo(o, compDict[o.orgCode.slice(0, 2)] as Organization))
        return orgVOs
    },
    async getCompDict() {
        const organizations = organizationRepository.getOrganizationsByParentId(-1)
        const companies = (await organizations).filter(o => o.orgType === '分公司')
        return companies.reduce((acc, comp) => { acc[comp.orgCode] = comp; return acc; }, {} as Record<string, Organization>)
    },

    async setOrganization(orgCode: string, orgName: string, parentCode: string) {
        return await prisma.$transaction(async (tx) => {
            const [newOrg, parentOrg] = await Promise.all([
                organizationRepository.getOrganizationByCode(orgCode, tx),
                organizationRepository.getOrganizationByCode(parentCode, tx)
            ])
            if (newOrg !== null) {
                throw new CustomError('待创建组织已存在')
            }
            if (parentOrg === null) {
                throw new CustomError('有效父组织不存在')
            }
            const organization = await organizationRepository.setOrganization(orgCode, orgName, parentOrg.level + 1, parentOrg.id, tx)
            const path = `${parentOrg.path}/${organization.id}`
            await Promise.all([organizationRepository.updateOrganizationPath(organization.id, path, tx),
            organizationRepository.updateOrganizationClosure(organization.id, parentOrg.id, tx)])
            return true
        })
    },

    async purveyorRegister(orgCode: string, orgName: string, parentOrg: string) {
        const exisitngOrg = await organizationRepository.getOrganizationByCode(orgCode)
        if (exisitngOrg !== null) {
            return true
        }
        await this.setOrganization(orgCode, orgName, parentOrg)
        return true
    }
}