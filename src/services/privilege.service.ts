import { CustomError } from "../errors/CustomError"
import { privilegeMapper } from "../mapper/privilege.mapper"
import { privilegeRepository } from "../repositories/privilege.repository"

export const privilegeService = {
    async getPrivilegesByRoles(roleIds: number[]) {
        const privileges = (await privilegeRepository.getPrivilegesByRoles(roleIds)).map(p => privilegeMapper.toPrivilegeDTO(p))
        return privileges
    },
    async setPrivilege(privCode: string, privName: string) {
        const existingPriv = await privilegeRepository.getPrivilegeByCode(privCode)
        if (existingPriv !== null) {
            throw new CustomError('重复权限code代码')
        }
        await privilegeRepository.setPrivilege(privCode, privName)
        return true
    }
}