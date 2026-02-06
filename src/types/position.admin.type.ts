import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "./page.type";
import { PositionStatus } from "../constants/position.status";

export const PositionAdminQueryDtoSchema = createPageQuerySchema(
    z.object({
        fuzzyConditions: z.object({
            text: z.string().optional().openapi({ example: '138550' })
        }),
        exactConditions: z.object()
    })
).openapi('PositionAdminQueryDto')

export type PositionAdminQueryDto = z.infer<typeof PositionAdminQueryDtoSchema>


export const PositionAdminDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    posCode: z.string().openapi({ example: 'E001' }),
    posName: z.string().openapi({ example: 'E002' }),
    status: z.enum(PositionStatus).openapi({ example: 1 }),
    memberNumber: z.number().openapi({ example: 10 }),
    createTime: z.iso.datetime(),
    updateTime: z.iso.datetime()
}).openapi('PositionAdminDto')

export type PositionAdminDto = z.infer<typeof PositionAdminDtoSchema>

export const PositionAdminVoSchema = PositionAdminDtoSchema.extend({
    statusText: z.string().openapi({ example: '正常' })
}).openapi('PositionAdminVo')

export type PositionAdminVo = z.infer<typeof PositionAdminVoSchema>