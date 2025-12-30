import { z } from '@hono/zod-openapi'
import { ClientStatus } from '../constants/client.status'

export const ClientDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    clientCode: z.string().openapi({ example: 'tender' }),
    clientName: z.string().openapi({ example: '采招系统' }),
    status: z.enum(ClientStatus).openapi({ example: 1 }),
    extAttributes: z.record(z.string(), z.unknown()).nullable().optional()
}).openapi('ClientResponse')

export type ClientDto = z.infer<typeof ClientDtoSchema>

export const ClientVoSchema = ClientDtoSchema.transform(dto => ({
    clientId: dto.id,
    clientCode: dto.clientCode,
    clientName: dto.clientName,
    status: dto.status,
    statusText: ClientStatus[dto.status],
    extAttributes: dto.extAttributes
})
)