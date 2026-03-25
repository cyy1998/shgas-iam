import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.boolean().optional(),
  userId: z.boolean().optional(),
  username: z.boolean().optional(),
  name: z.boolean().optional(),
  clientCode: z.boolean().optional(),
  loginType: z.boolean().optional(),
  loginTime: z.boolean().optional()
}).strict();
export const LoginLogSelectObjectSchema: z.ZodType<Prisma.LoginLogSelect> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogSelect>;
export const LoginLogSelectObjectZodSchema = makeSchema();
