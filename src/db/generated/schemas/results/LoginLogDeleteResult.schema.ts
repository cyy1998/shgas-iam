import * as z from 'zod';
export const LoginLogDeleteResultSchema = z.nullable(z.object({
  id: z.number().int(),
  userId: z.number().int(),
  username: z.string(),
  name: z.string(),
  clientCode: z.string(),
  loginType: z.string(),
  loginTime: z.date()
}));