import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  userId: z.number().int(),
  username: z.string().max(64),
  name: z.string().max(64),
  clientCode: z.string().max(64),
  loginType: z.string().max(64),
  loginTime: z.coerce.date().optional()
}).strict();
export const LoginLogCreateManyInputObjectSchema: z.ZodType<Prisma.LoginLogCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogCreateManyInput>;
export const LoginLogCreateManyInputObjectZodSchema = makeSchema();
