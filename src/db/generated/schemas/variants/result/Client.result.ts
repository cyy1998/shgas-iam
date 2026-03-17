import * as z from 'zod';
// prettier-ignore
export const ClientResultSchema = z.object({
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

export type ClientResultType = z.infer<typeof ClientResultSchema>;
