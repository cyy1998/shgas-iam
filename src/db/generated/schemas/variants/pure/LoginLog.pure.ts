import * as z from 'zod';
// prettier-ignore
export const LoginLogModelSchema = z.object({
    id: z.number().int(),
    userId: z.number().int(),
    username: z.string(),
    name: z.string(),
    clientCode: z.string(),
    loginType: z.string(),
    loginTime: z.date()
}).strict();

export type LoginLogPureType = z.infer<typeof LoginLogModelSchema>;
