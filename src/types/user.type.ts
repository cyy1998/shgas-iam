import { z } from "@hono/zod-openapi"
import type { EmploymentDto } from "./employment.type"
import type { PrivilegeDto } from "./privilege.type"
import type { RoleDto } from "./role.type"
import { UserStatus } from "../constants/user.status"

export const ClientDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    username: z.string().openapi({ example: '138550' }),
    name: z.string().openapi({ example: '蔡奕阳' }),
    mobile: z.string().nullable().openapi({ example: '17721462865' }),
    userType: z.string().nullable().openapi({ example: '正式员工' }),
    orcasId: z.string().nullable().openapi({ example: 'ada8wf89w83b2' }),
    status: z.enum(UserStatus).openapi({ example: 1 }),
    extAttributes: z.record(z.string(), z.unknown()).nullable()
}).openapi('ClientDto')

export type UserDto = {
    id: number
    username: string
    name: string
    mobile: string | null
    orcasId: string | null
    userType: string | null
    positions?: EmploymentDto[]
    privileges?: PrivilegeDto[]
    roles?: string[]
}