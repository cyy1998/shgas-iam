import { CustomError } from "../errors/CustomError";
import { employmentMapper } from "../mapper/employment.mapper";
import { employmentRepository } from "../repositories/employment.repository";
import { organizationRepository } from "../repositories/organization.repository";
import { positionRepository } from "../repositories/position.repository";
import { roleRepository } from "../repositories/role.repository";
import { userRepository } from "../repositories/user.repository";
import { privilegeService } from "./privilege.service";
import { roleService } from "./role.service";
import { userService } from "./user.service";


async function _getEmploymentsDetail(username: string) {
    const employments = await employmentRepository.getEmploymentsByUsername(username)
    const res = []
    for (const e of employments) {
        // const [rolesFromDepts, rolesFromPosition, rolesFromPosOrg, rolesFromEmployment] = await Promise.all([
        //     roleService.getRolesByOrganization(e.deptId),
        //     roleService.getRolesByPosition(e.posId),
        //     roleService.getRolesByOrgPosition(e.posId, e.deptId),
        //     roleService.getRolesByEmployment(e.id)
        // ])
        // const rolesCombined = [...rolesFromDepts, ...rolesFromPosition, ...rolesFromPosOrg, ...rolesFromEmployment]
        // const roles = rolesCombined.filter((item, index, self) => index === self.findIndex((t) => t.roleId === item.roleId))
        const roles = await roleRepository.getRolesByEmploymentId(e.id)
        const privileges = await privilegeService.getPrivilegesByRoles(roles.map(r => r.id))
        res.push({
            employment: employmentMapper.entityToDto(e),
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
    },
    async setEmployment(username: string, posCode: string, orgCode: string) {
        const [employment, user, department, company, position] = await Promise.all([
            employmentRepository.getEmploymentByUserOrgPosCode(username, orgCode, posCode),
            userRepository.getUserByUsername(username),
            organizationRepository.getOrganizationByCode(orgCode),
            organizationRepository.getOrganizationByCode(orgCode.slice(0, 2)),
            positionRepository.getPositionByCode(posCode)
        ])
        if (!user || !department || !company || !position) {
            throw new CustomError('实体不存在')
        }
        if (employment !== null) {
            throw new CustomError('相同任职关系已存在')
        }
        await employmentRepository.setEmployment(user.id, position.id, department.id, company.id)
        return true
    }

}