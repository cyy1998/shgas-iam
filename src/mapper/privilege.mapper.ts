import type { Privilege } from "@database/client"
import type { PrivilegeDto } from "../types/privilege.type"

export const privilegeMapper = {
    entityToDto(priv: Privilege): PrivilegeDto {
        return {
            id: priv.id,
            privCode: priv.privilegeCode,
            privName: priv.privilegeName
        }
    }
}