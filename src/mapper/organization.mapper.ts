import type { Organization } from "../../generated/prisma"
import type { OrganizationDto, OrganizationVo } from "../types/organization.type"

export const organizationMapper = {

    toOrganizationDTO(org: Organization): OrganizationDto {
        return {
            id: org.id,
            orgCode: org.orgCode,
            orgName: org.orgName,
            orgType: org.orgType,
            level: org.level
        }
    },

    toOrganizationVO(orgDTO: OrganizationDto, comapny: Organization): OrganizationVo {
        return {
            id: orgDTO.id,
            orgCode: orgDTO.orgCode,
            orgName: orgDTO.orgName,
            orgType: orgDTO.orgType,
            level: orgDTO.level,
            compCode: comapny.orgCode,
            compName: comapny.orgName
        }
    }

}