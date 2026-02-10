import type { Privilege } from "@prisma-client/client"
import type { PrivilegeDto } from "@schemas/privilege.type"

export const privilegeMapper = {
    entityToDto(priv: Privilege): PrivilegeDto {
        return {
            id: priv.id,
            privCode: priv.privilegeCode,
            privName: priv.privilegeName
        }
    }
}