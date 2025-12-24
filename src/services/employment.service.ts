import { employmentMapper } from "../mapper/employment.mapper";
import { employmentRepository } from "../repositories/employment.repository";
import { privilegeService } from "./privilege.service";
import { roleService } from "./role.service";


async function _getEmploymentsDetail(username: string) {
    const employments = await employmentRepository.getEmploymentsByUsername(username)
    const res = []
    for (const e of employments) {
        const [rolesFromDepts, rolesFromPosition, rolesFromPosOrg, rolesFromEmployment] = await Promise.all([
            roleService.getRolesByOrganization(e.deptId),
            roleService.getRolesByPosition(e.posId),
            roleService.getRolesByOrgPosition(e.posId, e.deptId),
            roleService.getRolesByEmployment(e.id)
        ])
        const rolesCombined = [...rolesFromDepts, ...rolesFromPosition, ...rolesFromPosOrg, ...rolesFromEmployment]
        const roles = rolesCombined.filter((item, index, self) => index === self.findIndex((t) => t.roleId === item.roleId))
        const privileges = await privilegeService.getPrivilegesByRoles(roles.map(r => r.roleId))
        res.push({
            employment: employmentMapper.toEmploymentDTO(e),
            privileges: privileges.map(p => p.privCode)
        })
    }
    return res
}

export const employmentService = {
    async getEmploymentsByUserAndPrivilege(username: string, privCode: string, codeType: string) {
        const eList = await _getEmploymentsDetail(username)
        if (codeType === 'full') {
            const filtedEList = eList.filter(e => e.privileges.includes(privCode))
            return filtedEList.map(e => e.employment)
        }
        else if (codeType === 'prefix') {
            const filtedEList = eList.filter(e => e.privileges.some(s => s.startsWith(privCode)))
            return filtedEList.map(e => e.employment)
        }
        else {
            const filtedEList = eList.filter(e => e.privileges.some(s => s.endsWith(privCode)))
            return filtedEList.map(e => e.employment)
        }
    }

}