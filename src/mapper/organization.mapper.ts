import type { Organization } from "../../generated/prisma"
import type { OrganizationDTO, OrganizationVO } from "../types/organization.type"

export const organizationMapper = {

    toOrganizationDTO(org: Organization): OrganizationDTO {
        return {
            id: org.id,
            orgCode: org.orgCode,
            orgName: org.orgName,
            orgType: org.orgType,
            level: org.level
        }
    },

    toOrganizationVO(orgDTO: OrganizationDTO, comapny: Organization): OrganizationVO {
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