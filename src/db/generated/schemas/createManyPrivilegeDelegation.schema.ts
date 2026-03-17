import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationCreateManyInputObjectSchema as PrivilegeDelegationCreateManyInputObjectSchema } from './objects/PrivilegeDelegationCreateManyInput.schema';

export const PrivilegeDelegationCreateManySchema: z.ZodType<Prisma.PrivilegeDelegationCreateManyArgs> = z.object({ data: z.union([ PrivilegeDelegationCreateManyInputObjectSchema, z.array(PrivilegeDelegationCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateManyArgs>;

export const PrivilegeDelegationCreateManyZodSchema = z.object({ data: z.union([ PrivilegeDelegationCreateManyInputObjectSchema, z.array(PrivilegeDelegationCreateManyInputObjectSchema) ]),  }).strict();