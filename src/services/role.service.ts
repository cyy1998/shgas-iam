import { CustomError } from "../errors/CustomError"
import { roleMapper } from "../mapper/role.mapper"
import { employmentRepository } from "../repositories/employment.repository"
import { organizationRepository } from "../repositories/organization.repository"
import { posorgRepository } from "../repositories/posorg.repository"
import { roleRepository } from "../repositories/role.repository"
import { mergeAndDedupe } from '../utils/common.utils'

export const roleService = {
    async getRolesByOrganization(orgId: number) {
        const org = await organizationRepository.getOrgById(orgId)
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
    },
    async getRolesByUserId(userId: number) {
        const roles = (await roleRepository.getRolesByUserId(userId)).map(r => roleMapper.toRoleDTO(r))
        return roles
    },
    async setRoleForEmployment(username: string, posCode: string, orgCode: string, roleCode: string) {
        const employment = await employmentRepository.getEmploymentByUserOrgPosCode(username, posCode, orgCode)
        if (employment === null) {
            throw new CustomError('任职关系不存在')
        }
        const role = await roleRepository.getRoleByCode(roleCode)
        if (role === null) {
            throw new CustomError('角色不存在')
        }
        if (await roleRepository.checkEmploymentRoleExisting(role.id, employment.id)) {
            return true
        }
        await roleRepository.setRoleForEmployment(role.id, employment.id)
        return true

    }
}