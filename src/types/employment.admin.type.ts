import { z } from "@hono/zod-openapi";
import { endTime, startTime } from "hono/timing";
import { EmploymentStatus } from "../constants/employment.status";

export const EmploymentAdminDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    userId: z.number().openapi({ example: 1 }),
    username: z.string().openapi({ example: '138550' }),
    name: z.string().openapi({ example: '138550' }),
    posId: z.number().openapi({ example: 1 }),
    posCode: z.string().openapi({ example: 'E033' }),
    posName: z.string().openapi({ example: '职员' }),
    orgId: z.number().openapi({ example: 1 }),
    orgCode: z.string().openapi({ example: 'SR23' }),
    orgName: z.string().openapi({ example: '信息中心' }),
    compId: z.number().openapi({ example: 1 }),
    compCode: z.string().openapi({ example: 'SR' }),
    compName: z.string().openapi({ example: '上海燃气' }),
    isPrimary: z.boolean().openapi({ example: true }),
    status: z.enum(EmploymentStatus).openapi({ example: 1 }),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime().nullable(),
    createTime: z.iso.datetime(),
    updateTime: z.iso.datetime()
}).openapi('EmploymentAdminDto')

export type EmploymentAdminDto = z.infer<typeof EmploymentAdminDtoSchema>

export const EmploymentAdminDetailDtoSchema = EmploymentAdminDtoSchema.extend({
    privileges: z.array(z.string()).default([]).openapi({ example: ['ui:button:tender:create-GYBG'] }),
    roles: z.array(z.string()).default([]).openapi({ example: ['tender:default-user'] })
}).openapi('EmploymentAdminDetailDto')

export type EmploymentAdminDetailDto = z.infer<typeof EmploymentAdminDetailDtoSchema>

export const EmploymentAdminVoSchema = EmploymentAdminDtoSchema.extend({
    statusText: z.string().openapi({ example: '正常' })
}).openapi('EmploymentAdminVo')

export type EmploymentAdminVo = z.infer<typeof EmploymentAdminVoSchema>