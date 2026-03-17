import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { EmploymentOrderByWithRelationInputObjectSchema as EmploymentOrderByWithRelationInputObjectSchema } from './EmploymentOrderByWithRelationInput.schema';
import { RoleOrderByWithRelationInputObjectSchema as RoleOrderByWithRelationInputObjectSchema } from './RoleOrderByWithRelationInput.schema'

const makeSchema = () => z.object({
  employmentId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  employment: z.lazy(() => EmploymentOrderByWithRelationInputObjectSchema).optional(),
  role: z.lazy(() => RoleOrderByWithRelationInputObjectSchema).optional()
}).strict();
export const EmploymentRoleOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.EmploymentRoleOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleOrderByWithRelationInput>;
export const EmploymentRoleOrderByWithRelationInputObjectZodSchema = makeSchema();
