import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  userId: z.number().int(),
  username: z.string().max(64),
  name: z.string().max(64),
  clientCode: z.string().max(64),
  loginType: z.string().max(64),
  loginTime: z.coerce.date().optional()
}).strict();
export const LoginLogCreateInputObjectSchema: z.ZodType<Prisma.LoginLogCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogCreateInput>;
export const LoginLogCreateInputObjectZodSchema = makeSchema();
