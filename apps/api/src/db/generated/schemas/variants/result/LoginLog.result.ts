import * as z from 'zod';
// prettier-ignore
export const LoginLogResultSchema = z.object({
    id: z.number().int(),
    userId: z.number().int(),
    username: z.string(),
    name: z.string(),
    clientCode: z.string(),
    loginType: z.string(),
    loginTime: z.date()
}).strict();

export type LoginLogResultType = z.infer<typeof LoginLogResultSchema>;
