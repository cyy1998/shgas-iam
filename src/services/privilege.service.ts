import { privilegeMapper } from "../mapper/privilege.mapper"
import { privilegeRepository } from "../repositories/privilege.repository"

export const privilegeService = {
    async getPrivilegesByRoles(roleIds: number[]) {
        const privileges = (await privilegeRepository.getPrivilegesByRoles(roleIds)).map(p => privilegeMapper.toPrivilegeDTO(p))
        return privileges
    }
}