import { Role } from "../../generated/prisma"
import { RoleDTO } from "../types/role.type"

export const roleMapper = {
    toRoleDTO(role: Role): RoleDTO {
        return {
            roleId: role.id,
            roleCode: role.roleCode,
            roleName: role.roleName,
        }
    }
}