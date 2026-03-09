import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { RolePrivilegeCreateManyInputObjectSchema as RolePrivilegeCreateManyInputObjectSchema } from './objects/RolePrivilegeCreateManyInput.schema';

export const RolePrivilegeCreateManySchema: z.ZodType<Prisma.RolePrivilegeCreateManyArgs> = z.object({ data: z.union([ RolePrivilegeCreateManyInputObjectSchema, z.array(RolePrivilegeCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeCreateManyArgs>;

export const RolePrivilegeCreateManyZodSchema = z.object({ data: z.union([ RolePrivilegeCreateManyInputObjectSchema, z.array(RolePrivilegeCreateManyInputObjectSchema) ]),  }).strict();