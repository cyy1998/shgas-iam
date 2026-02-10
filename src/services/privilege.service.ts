import { CustomError } from "@errors/CustomError"
import { prisma } from "@database/db"
import { privilegeMapper } from "@mapper/privilege.mapper"
import { privilegeRepository } from "../repositories/privilege.repository"

export const privilegeService = {
    async getPrivilegesByRoleIds(roleIds: number[]) {
        const privileges = (await privilegeRepository.getPrivilegesByRoleIds(roleIds)).map(p => privilegeMapper.entityToDto(p))
        return privileges
    },
    async setPrivilege(privCode: string, privName: string) {
        return await prisma.$transaction(async (tx) => {
            const existingPriv = await privilegeRepository.getPrivilegeByCode(privCode, tx)
            if (existingPriv !== null) {
                throw new CustomError('重复权限code代码')
            }
            await privilegeRepository.setPrivilege(privCode, privName, tx)
            return true
        })
    }
}