import * as z from 'zod';
// prettier-ignore
export const LoginLogInputSchema = z.object({
    userId: z.number().int(),
    username: z.string(),
    name: z.string(),
    clientCode: z.string(),
    loginType: z.string(),
    loginTime: z.date()
}).strict();

export type LoginLogInputType = z.infer<typeof LoginLogInputSchema>;
