import type { Organization } from "../../generated/prisma"
import type { OrganizationDTO } from "../types/organization.type"

export const organizationMapper = {

    toOrganizationDTO(org: Organization): OrganizationDTO {
        return {
            id: org.id,
            orgCode: org.orgCode,
            orgName: org.orgName,
            orgType: org.orgType,
            level: org.level
        }
    }

}