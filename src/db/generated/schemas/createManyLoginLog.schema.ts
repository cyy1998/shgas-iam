import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogCreateManyInputObjectSchema as LoginLogCreateManyInputObjectSchema } from './objects/LoginLogCreateManyInput.schema';

export const LoginLogCreateManySchema: z.ZodType<Prisma.LoginLogCreateManyArgs> = z.object({ data: z.union([ LoginLogCreateManyInputObjectSchema, z.array(LoginLogCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.LoginLogCreateManyArgs>;

export const LoginLogCreateManyZodSchema = z.object({ data: z.union([ LoginLogCreateManyInputObjectSchema, z.array(LoginLogCreateManyInputObjectSchema) ]),  }).strict();