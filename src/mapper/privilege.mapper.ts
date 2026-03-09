import type { PrivilegeDto } from '@schemas/privilege.type';
import type { Privilege } from '@/db/generated/prisma/client';

export const privilegeMapper = {
  entityToDto(priv: Privilege): PrivilegeDto {
    return {
      id: priv.id,
      privCode: priv.privilegeCode,
      privName: priv.privilegeName,
    };
  },
};
