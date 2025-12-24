import type { PrivilegeDTO, PrivilegeEntity } from "../types/privilege.type"

export const privilegeMapper = {
    toPrivilegeDTO(priv: PrivilegeEntity): PrivilegeDTO {
        return {
            id: priv.id,
            privCode: priv.privilegeCode,
            privName: priv.privilegeName,
            objType: priv.object.objectType,
            path: priv.object.path ?? 'none',
        }
    }
}