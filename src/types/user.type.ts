import { EmploymentDTO } from "./employment.type"
import { PrivilegeDTO } from "./privilege.type"
import { RoleDTO } from "./role.type"

export type UserDTO = {
    id: number
    username: string
    name: string
    mobile: string | null
    positions?: EmploymentDTO[]
    privileges?: PrivilegeDTO[]
    roles?: RoleDTO[]
}