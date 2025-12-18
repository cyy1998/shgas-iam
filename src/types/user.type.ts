import type { EmploymentDTO } from "./employment.type"
import type { PrivilegeDTO } from "./privilege.type"
import type { RoleDTO } from "./role.type"

export type UserDTO = {
    id: number
    username: string
    name: string
    mobile: string | null
    orcasId: string | null
    positions?: EmploymentDTO[]
    privileges?: PrivilegeDTO[]
    roles?: RoleDTO[]
}