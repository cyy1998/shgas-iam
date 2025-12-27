import type { Privilege } from "../../generated/prisma"
import type { PrivilegeDTO } from "../types/privilege.type"

export const privilegeMapper = {
    toPrivilegeDTO(priv: Privilege): PrivilegeDTO {
        return {
            id: priv.id,
            privCode: priv.privilegeCode,
            privName: priv.privilegeName
        }
    }
}