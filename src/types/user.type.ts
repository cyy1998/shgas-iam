import type { EmploymentDto } from "./employment.type"
import type { PrivilegeDto } from "./privilege.type"
import type { RoleDto } from "./role.type"


export type UserDto = {
    id: number
    username: string
    name: string
    mobile: string | null
    orcasId: string | null
    userType: string | null
    positions?: EmploymentDto[]
    privileges?: PrivilegeDto[]
    roles?: RoleDto[]
}