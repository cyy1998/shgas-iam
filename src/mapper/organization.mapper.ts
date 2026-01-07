import type { Organization } from "../../generated/prisma"
import type { OrganizationDto, FormalOrganizationVo } from "../types/organization.type"

export const organizationMapper = {

    entityToDto(org: Organization): OrganizationDto {
        return {
            id: org.id,
            orgCode: org.orgCode,
            orgName: org.orgName,
            orgType: org.orgType,
            level: org.level
        }
    },

    dtotoFormalOrganizationVo(orgDto: OrganizationDto, comapny: Organization): FormalOrganizationVo {
        return {
            id: orgDto.id,
            orgCode: orgDto.orgCode,
            orgName: orgDto.orgName,
            orgType: orgDto.orgType,
            level: orgDto.level,
            compCode: comapny.orgCode,
            compName: comapny.orgName
        }
    }

}