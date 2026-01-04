import type { Role } from "../../generated/prisma"
import type { RoleDto } from "../types/role.type"

export const roleMapper = {
    entityToDto(role: Role): RoleDto {
        return {
            id: role.id,
            roleCode: role.roleCode,
            roleName: role.roleName,
        }
    }
}