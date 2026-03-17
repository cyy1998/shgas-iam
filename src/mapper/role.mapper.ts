import type { Role } from "@/db/generated/prisma/client";
import type { RoleDto } from "@/services/role/role.schema";

export const roleMapper = {
  entityToDto(role: Role): RoleDto {
    return {
      id: role.id,
      roleCode: role.roleCode,
      roleName: role.roleName,
    };
  },
};
