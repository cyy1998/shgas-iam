import { roleMapper } from "../mapper/role.mapper"
import { organizationRepository } from "../repositories/organization.repository"
import { posorgRepository } from "../repositories/posorg.repository"
import { roleRepository } from "../repositories/role.repository"
import { mergeAndDedupe } from '../utils/common.utils'

export const roleService = {
    async getRolesByOrganization(orgId: number) {
        const org = await organizationRepository.getOrganizationById(orgId)
        if (org === null) {
            return []
        }
        const ancestorIds = org.path.split('/').filter(Boolean).map(Number)
        ancestorIds.pop()
        const rolesAncestor = (await roleRepository.getRolesByAncestorOrgs(ancestorIds)).map(r => roleMapper.toRoleDTO(r))
        const rolesDirect = (await roleRepository.getRolesByDirectOrg(org.id)).map(r => roleMapper.toRoleDTO(r))
        return mergeAndDedupe(rolesAncestor, rolesDirect, 'roleId')
    },
    async getRolesByPosition(posId: number) {
        const roles = (await roleRepository.getRolesByPosition(posId)).map(r => roleMapper.toRoleDTO(r))
        return roles
    },
    async getRolesByOrgPosition(posId: number, orgId: number) {
        const posOrg = await posorgRepository.getPosOrgById(posId, orgId)
        if (posOrg === null) {
            return []
        }
        const roles = (await roleRepository.getRolesByPosOrg(posOrg.id)).map(r => roleMapper.toRoleDTO(r))
        return roles
    },
    async getRolesByEmployment(employmentId: number) {
        const roles = (await roleRepository.getRolesByEmployment(employmentId)).map(r => roleMapper.toRoleDTO(r))
        return roles
    }
}