import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeWhereInputObjectSchema as RolePrivilegeWhereInputObjectSchema } from './RolePrivilegeWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => RolePrivilegeWhereInputObjectSchema).optional(),
  some: z.lazy(() => RolePrivilegeWhereInputObjectSchema).optional(),
  none: z.lazy(() => RolePrivilegeWhereInputObjectSchema).optional()
}).strict();
export const RolePrivilegeListRelationFilterObjectSchema: z.ZodType<Prisma.RolePrivilegeListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeListRelationFilter>;
export const RolePrivilegeListRelationFilterObjectZodSchema = makeSchema();
