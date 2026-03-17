import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleCreateManyInputObjectSchema as PosOrgRoleCreateManyInputObjectSchema } from './objects/PosOrgRoleCreateManyInput.schema';

export const PosOrgRoleCreateManySchema: z.ZodType<Prisma.PosOrgRoleCreateManyArgs> = z.object({ data: z.union([ PosOrgRoleCreateManyInputObjectSchema, z.array(PosOrgRoleCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleCreateManyArgs>;

export const PosOrgRoleCreateManyZodSchema = z.object({ data: z.union([ PosOrgRoleCreateManyInputObjectSchema, z.array(PosOrgRoleCreateManyInputObjectSchema) ]),  }).strict();