import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  userId: z.literal(true).optional(),
  username: z.literal(true).optional(),
  name: z.literal(true).optional(),
  clientCode: z.literal(true).optional(),
  loginType: z.literal(true).optional(),
  loginTime: z.literal(true).optional()
}).strict();
export const LoginLogMinAggregateInputObjectSchema: z.ZodType<Prisma.LoginLogMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogMinAggregateInputType>;
export const LoginLogMinAggregateInputObjectZodSchema = makeSchema();
