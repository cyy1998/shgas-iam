import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { RoleOrderByWithRelationInputObjectSchema as RoleOrderByWithRelationInputObjectSchema } from './RoleOrderByWithRelationInput.schema';
import { PrivilegeOrderByWithRelationInputObjectSchema as PrivilegeOrderByWithRelationInputObjectSchema } from './PrivilegeOrderByWithRelationInput.schema'

const makeSchema = () => z.object({
  roleId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional(),
  role: z.lazy(() => RoleOrderByWithRelationInputObjectSchema).optional(),
  privilege: z.lazy(() => PrivilegeOrderByWithRelationInputObjectSchema).optional()
}).strict();
export const RolePrivilegeOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.RolePrivilegeOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeOrderByWithRelationInput>;
export const RolePrivilegeOrderByWithRelationInputObjectZodSchema = makeSchema();
