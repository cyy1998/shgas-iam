import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringFilterObjectSchema as StringFilterObjectSchema } from './StringFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { EmploymentListRelationFilterObjectSchema as EmploymentListRelationFilterObjectSchema } from './EmploymentListRelationFilter.schema';
import { OrganizationRoleListRelationFilterObjectSchema as OrganizationRoleListRelationFilterObjectSchema } from './OrganizationRoleListRelationFilter.schema';
import { PosOrgCompositionListRelationFilterObjectSchema as PosOrgCompositionListRelationFilterObjectSchema } from './PosOrgCompositionListRelationFilter.schema';
import { OrganizationNullableScalarRelationFilterObjectSchema as OrganizationNullableScalarRelationFilterObjectSchema } from './OrganizationNullableScalarRelationFilter.schema';
import { OrganizationListRelationFilterObjectSchema as OrganizationListRelationFilterObjectSchema } from './OrganizationListRelationFilter.schema';
import { OrganizationClosureListRelationFilterObjectSchema as OrganizationClosureListRelationFilterObjectSchema } from './OrganizationClosureListRelationFilter.schema';
import { PrivilegeDelegationListRelationFilterObjectSchema as PrivilegeDelegationListRelationFilterObjectSchema } from './PrivilegeDelegationListRelationFilter.schema'

const organizationwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => OrganizationWhereInputObjectSchema), z.lazy(() => OrganizationWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => OrganizationWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => OrganizationWhereInputObjectSchema), z.lazy(() => OrganizationWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  orgCode: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  orgName: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  parentId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  businessParentId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  path: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  level: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  orgType: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  orderNum: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  isVirtual: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  isEntity: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  deptEmployments: z.lazy(() => EmploymentListRelationFilterObjectSchema).optional(),
  compEmployments: z.lazy(() => EmploymentListRelationFilterObjectSchema).optional(),
  roles: z.lazy(() => OrganizationRoleListRelationFilterObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionListRelationFilterObjectSchema).optional(),
  parent: z.union([z.lazy(() => OrganizationNullableScalarRelationFilterObjectSchema), z.lazy(() => OrganizationWhereInputObjectSchema)]).optional(),
  children: z.lazy(() => OrganizationListRelationFilterObjectSchema).optional(),
  ancestorClosures: z.lazy(() => OrganizationClosureListRelationFilterObjectSchema).optional(),
  descendantClosures: z.lazy(() => OrganizationClosureListRelationFilterObjectSchema).optional(),
  privilegeDelegations: z.lazy(() => PrivilegeDelegationListRelationFilterObjectSchema).optional()
}).strict();
export const OrganizationWhereInputObjectSchema: z.ZodType<Prisma.OrganizationWhereInput> = organizationwhereinputSchema as unknown as z.ZodType<Prisma.OrganizationWhereInput>;
export const OrganizationWhereInputObjectZodSchema = organizationwhereinputSchema;
