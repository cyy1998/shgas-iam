import type { Organization } from "@prisma-client/client"
import { config } from "../config"
import { OrganizationType } from "@constants/organization.type"
import { CustomError } from "@errors/CustomError"
import { prisma } from "@database/db"
import { organizationMapper } from "@mapper/organization.mapper"
import { organizationRepository } from "../repositories/organization.repository"
import { OrganizationDtoSchema, type OrganizationCreateDto, type OrganizationQueryDto } from "@schemas/organization.common.type"

const compDict = {}

async function getCompDict() {
    const organizations = organizationRepository.getOrganizationsByParentId(-1)
    const companies = (await organizations).filter(o => o.orgType === '分公司')
    return companies.reduce((acc, comp) => { acc[comp.orgCode] = comp; return acc; }, {} as Record<string, Organization>)
}

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
    async getOrganizationByCode(orgCode: string) {
        const organization = await organizationRepository.getOrganizationByCode(orgCode)
        if (organization === null) {
            throw new CustomError('组织不存在')
        }
        return organizationMapper.entityToDto(organization)
    },
    // async getOrganizationsByCode(orgCode: string, orgLevel: number) {
    //     const organizations = await organizationRepository.searchOrganizations(orgCode, orgLevel)
    //     const orgDtos = organizations.map(o => organizationMapper.entityToDto(o))
    //     return orgDtos
    // },
    async getOrganizationsByParentCodes(parentCodes: string[]) {
        const organizations = await organizationRepository.getOrganizationsByParentsCode(parentCodes)
        const orgDtos = organizations.map(o => organizationMapper.entityToDto(o))
        const compDict = await getCompDict()
        const orgVos = orgDtos.map(o => organizationMapper.dtotoFormalOrganizationVo(o, compDict[o.orgCode.slice(0, 2)] as Organization))
        return orgVos
    },
    async searchOrganizations(organizationQueryDto: OrganizationQueryDto) {
        const organizations = await organizationRepository.searchOrganizations(organizationQueryDto)
        const orgDtos = organizations.map(o => organizationMapper.entityToDto(o))
        // const compDict = await getCompDict()
        // const orgVos = orgDtos.map(o => organizationMapper.dtotoFormalOrganizationVo(o, compDict[o.orgCode.slice(0, 2)] as Organization))
        return orgDtos
    },

    async setOrganization(organizationCreateDto: OrganizationCreateDto) {
        return await prisma.$transaction(async (tx) => {
            const [newOrg, parentOrg] = await Promise.all([
                organizationRepository.getOrganizationByCode(organizationCreateDto.orgCode, tx),
                organizationRepository.getOrganizationByCode(organizationCreateDto.parentCode, tx)
            ])
            if (newOrg !== null) {
                throw new CustomError('待创建组织已存在')
            }
            if (parentOrg === null) {
                throw new CustomError('有效父组织不存在')
            }
            await organizationRepository.setOrganization(
                organizationCreateDto.orgCode,
                organizationCreateDto.orgName,
                parentOrg.level + 1,
                organizationCreateDto.orgType,
                parentOrg,
                tx)
            return true
        })
    },

    async purveyorRegister(orgCode: string, orgName: string, parentCode: string) {
        const exisitngOrg = await organizationRepository.getOrganizationByCode(orgCode)
        if (exisitngOrg !== null) {
            return true
        }
        await this.setOrganization({ orgCode: orgCode, orgName: orgName, parentCode: parentCode, orgType: OrganizationType.External })
        return true
    }
}