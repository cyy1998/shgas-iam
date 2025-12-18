import { organizationRepository } from "../repositories/organization.repository"
import type { EmploymentDTO } from "../types/employment.type"

export const roleService = {
    async getRolesByOrganization(orgId: number) {
        const org = await organizationRepository.getOrganizationById(orgId)
        if (org === null) {
            return []
        }
        const ancestorIds = org.path.split('/').filter(Boolean).map(Number)
        return ancestorIds
    },
    async getRolesByEmployments(employments: EmploymentDTO[]) {

    }
}