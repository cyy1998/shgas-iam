import * as z from 'zod';
// prettier-ignore
export const ClientModelSchema = z.object({
    id: z.number().int(),
    clientCode: z.string(),
    clientName: z.string(),
    url: z.string().nullable(),
    status: z.number().int(),
    description: z.string().nullable(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    extAttributes: z.unknown(),
    roles: z.array(z.unknown())
}).strict();

export type ClientPureType = z.infer<typeof ClientModelSchema>;
