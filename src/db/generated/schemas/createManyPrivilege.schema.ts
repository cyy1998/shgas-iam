import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeCreateManyInputObjectSchema as PrivilegeCreateManyInputObjectSchema } from './objects/PrivilegeCreateManyInput.schema';

export const PrivilegeCreateManySchema: z.ZodType<Prisma.PrivilegeCreateManyArgs> = z.object({ data: z.union([ PrivilegeCreateManyInputObjectSchema, z.array(PrivilegeCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.PrivilegeCreateManyArgs>;

export const PrivilegeCreateManyZodSchema = z.object({ data: z.union([ PrivilegeCreateManyInputObjectSchema, z.array(PrivilegeCreateManyInputObjectSchema) ]),  }).strict();