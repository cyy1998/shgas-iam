import type { Role } from "../../generated/prisma"
import type { RoleDto } from "../types/role.type"

export const roleMapper = {
    toRoleDTO(role: Role): RoleDto {
        return {
            roleId: role.id,
            roleCode: role.roleCode,
            roleName: role.roleName,
        }
    }
}