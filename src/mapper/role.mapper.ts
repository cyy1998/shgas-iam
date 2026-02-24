import type { Role } from '@prisma-client/client';
import type { RoleDto } from '@schemas/role.type';

export const roleMapper = {
  entityToDto(role: Role): RoleDto {
    return {
      id: role.id,
      roleCode: role.roleCode,
      roleName: role.roleName,
    };
  },
};
