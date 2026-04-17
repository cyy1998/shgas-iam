import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { OrganizationOrderByWithRelationInputObjectSchema as OrganizationOrderByWithRelationInputObjectSchema } from './OrganizationOrderByWithRelationInput.schema';
import { RoleOrderByWithRelationInputObjectSchema as RoleOrderByWithRelationInputObjectSchema } from './RoleOrderByWithRelationInput.schema'

const makeSchema = () => z.object({
  organizationId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  isAllSub: SortOrderSchema.optional(),
  organization: z.lazy(() => OrganizationOrderByWithRelationInputObjectSchema).optional(),
  role: z.lazy(() => RoleOrderByWithRelationInputObjectSchema).optional()
}).strict();
export const OrganizationRoleOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleOrderByWithRelationInput>;
export const OrganizationRoleOrderByWithRelationInputObjectZodSchema = makeSchema();
