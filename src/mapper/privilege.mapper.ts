import type { Privilege } from "../../generated/prisma"
import type { PrivilegeDto } from "../types/privilege.type"

export const privilegeMapper = {
    toPrivilegeDTO(priv: Privilege): PrivilegeDto {
        return {
            id: priv.id,
            privCode: priv.privilegeCode,
            privName: priv.privilegeName
        }
    }
}