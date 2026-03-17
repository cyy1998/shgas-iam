import * as z from 'zod';
// prettier-ignore
export const ClientInputSchema = z.object({
    id: z.number().int(),
    clientCode: z.string(),
    clientName: z.string(),
    url: z.string().optional().nullable(),
    status: z.number().int(),
    description: z.string().optional().nullable(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    extAttributes: z.unknown(),
    roles: z.array(z.unknown())
}).strict();

export type ClientInputType = z.infer<typeof ClientInputSchema>;
