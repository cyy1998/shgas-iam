import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RoleCreateManyInputObjectSchema as RoleCreateManyInputObjectSchema } from './objects/RoleCreateManyInput.schema';

export const RoleCreateManySchema: z.ZodType<Prisma.RoleCreateManyArgs> = z.object({ data: z.union([ RoleCreateManyInputObjectSchema, z.array(RoleCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.RoleCreateManyArgs>;

export const RoleCreateManyZodSchema = z.object({ data: z.union([ RoleCreateManyInputObjectSchema, z.array(RoleCreateManyInputObjectSchema) ]),  }).strict();