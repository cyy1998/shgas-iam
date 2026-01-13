import { z } from "@hono/zod-openapi"
import { EmploymentDtoSchema, type EmploymentDto } from "./employment.common.type"
import { UserStatus } from "../constants/user.status"

export const UserDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    username: z.string().openapi({ example: '138550' }),
    name: z.string().openapi({ example: '蔡奕阳' }),
    mobile: z.string().nullable().openapi({ example: '17721462865' }),
    userType: z.string().nullable().openapi({ example: '正式员工' }),
    orcasId: z.string().nullable().openapi({ example: 'ada8wf89w83b2' }),
    status: z.enum(UserStatus).openapi({ example: 1 }),
    orderNum: z.number().openapi({ example: 1 })
    // positions: z.array(EmploymentDtoSchema).optional(),
    // privileges: z.array(PrivilegeDtoSchema).optional(),
    // roles: z.array(z.string()).optional().openapi({ example: ['tender:default-user'] })
}).openapi('UserDto')

export type UserDto = z.infer<typeof UserDtoSchema>

export const UserDetailDtoSchema = UserDtoSchema.extend({
    employments: z.array(EmploymentDtoSchema).optional(),
    privileges: z.array(z.string()).default([]).openapi({ example: ['ui:button:tender:create-GYBG'] }),
    roles: z.array(z.string()).default([]).openapi({ example: ['tender:default-user'] })
})

export type UserDetailDto = z.infer<typeof UserDetailDtoSchema>

export const UserQueryDtoSchema = z.object({
    usernames: z.array(z.string()).optional().openapi({ example: ['138550', '136163'] }),
    phones: z.array(z.string()).optional().openapi({ example: ['17721462865'] }),
    wxIds: z.array(z.string()).optional().openapi({ example: ['1592677631'] }),
    ancestorOrgCodes: z.array(z.string()).optional().openapi({ example: ['SR', 'SB'] }),
    ancestorOrgDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
    positionCodes: z.array(z.string()).optional().openapi({ example: ['E033', 'E034'] }),
    roleCodes: z.array(z.string()).optional().openapi({ example: ['tender:default-user'] })
}).openapi('UserQueryDto')

export type UserQueryDto = z.infer<typeof UserQueryDtoSchema>


