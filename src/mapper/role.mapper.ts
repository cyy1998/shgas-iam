import type { RoleDto } from "@schemas/role.type";
import type { Role } from "@/db/generated/prisma/client";

export const roleMapper = {
  entityToDto(role: Role): RoleDto {
    return {
      id: role.id,
      roleCode: role.roleCode,
      roleName: role.roleName,
    };
  },
};
