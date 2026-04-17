import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { ClientOrderByWithRelationInputObjectSchema as ClientOrderByWithRelationInputObjectSchema } from './ClientOrderByWithRelationInput.schema';
import { PositionRoleOrderByRelationAggregateInputObjectSchema as PositionRoleOrderByRelationAggregateInputObjectSchema } from './PositionRoleOrderByRelationAggregateInput.schema';
import { OrganizationRoleOrderByRelationAggregateInputObjectSchema as OrganizationRoleOrderByRelationAggregateInputObjectSchema } from './OrganizationRoleOrderByRelationAggregateInput.schema';
import { PosOrgRoleOrderByRelationAggregateInputObjectSchema as PosOrgRoleOrderByRelationAggregateInputObjectSchema } from './PosOrgRoleOrderByRelationAggregateInput.schema';
import { EmploymentRoleOrderByRelationAggregateInputObjectSchema as EmploymentRoleOrderByRelationAggregateInputObjectSchema } from './EmploymentRoleOrderByRelationAggregateInput.schema';
import { RolePrivilegeOrderByRelationAggregateInputObjectSchema as RolePrivilegeOrderByRelationAggregateInputObjectSchema } from './RolePrivilegeOrderByRelationAggregateInput.schema';
import { RoleOrderByRelevanceInputObjectSchema as RoleOrderByRelevanceInputObjectSchema } from './RoleOrderByRelevanceInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  roleCode: SortOrderSchema.optional(),
  roleName: SortOrderSchema.optional(),
  clientId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  client: z.lazy(() => ClientOrderByWithRelationInputObjectSchema).optional(),
  positions: z.lazy(() => PositionRoleOrderByRelationAggregateInputObjectSchema).optional(),
  organizations: z.lazy(() => OrganizationRoleOrderByRelationAggregateInputObjectSchema).optional(),
  positionOrganizations: z.lazy(() => PosOrgRoleOrderByRelationAggregateInputObjectSchema).optional(),
  employments: z.lazy(() => EmploymentRoleOrderByRelationAggregateInputObjectSchema).optional(),
  privileges: z.lazy(() => RolePrivilegeOrderByRelationAggregateInputObjectSchema).optional(),
  _relevance: z.lazy(() => RoleOrderByRelevanceInputObjectSchema).optional()
}).strict();
export const RoleOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.RoleOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleOrderByWithRelationInput>;
export const RoleOrderByWithRelationInputObjectZodSchema = makeSchema();
