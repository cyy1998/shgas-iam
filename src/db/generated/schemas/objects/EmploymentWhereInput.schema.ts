import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { DateTimeNullableFilterObjectSchema as DateTimeNullableFilterObjectSchema } from './DateTimeNullableFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { UserScalarRelationFilterObjectSchema as UserScalarRelationFilterObjectSchema } from './UserScalarRelationFilter.schema';
import { UserWhereInputObjectSchema as UserWhereInputObjectSchema } from './UserWhereInput.schema';
import { OrganizationScalarRelationFilterObjectSchema as OrganizationScalarRelationFilterObjectSchema } from './OrganizationScalarRelationFilter.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { PositionScalarRelationFilterObjectSchema as PositionScalarRelationFilterObjectSchema } from './PositionScalarRelationFilter.schema';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema';
import { PosOrgCompositionScalarRelationFilterObjectSchema as PosOrgCompositionScalarRelationFilterObjectSchema } from './PosOrgCompositionScalarRelationFilter.schema';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './PosOrgCompositionWhereInput.schema';
import { EmploymentRoleListRelationFilterObjectSchema as EmploymentRoleListRelationFilterObjectSchema } from './EmploymentRoleListRelationFilter.schema'

const employmentwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => EmploymentWhereInputObjectSchema), z.lazy(() => EmploymentWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => EmploymentWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => EmploymentWhereInputObjectSchema), z.lazy(() => EmploymentWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  userId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  posId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  orgId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  compId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  isPrimary: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  startTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  endTime: z.union([z.lazy(() => DateTimeNullableFilterObjectSchema), z.coerce.date()]).optional().nullable(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  user: z.union([z.lazy(() => UserScalarRelationFilterObjectSchema), z.lazy(() => UserWhereInputObjectSchema)]).optional(),
  deptartment: z.union([z.lazy(() => OrganizationScalarRelationFilterObjectSchema), z.lazy(() => OrganizationWhereInputObjectSchema)]).optional(),
  company: z.union([z.lazy(() => OrganizationScalarRelationFilterObjectSchema), z.lazy(() => OrganizationWhereInputObjectSchema)]).optional(),
  position: z.union([z.lazy(() => PositionScalarRelationFilterObjectSchema), z.lazy(() => PositionWhereInputObjectSchema)]).optional(),
  posOrg: z.union([z.lazy(() => PosOrgCompositionScalarRelationFilterObjectSchema), z.lazy(() => PosOrgCompositionWhereInputObjectSchema)]).optional(),
  roles: z.lazy(() => EmploymentRoleListRelationFilterObjectSchema).optional()
}).strict();
export const EmploymentWhereInputObjectSchema: z.ZodType<Prisma.EmploymentWhereInput> = employmentwhereinputSchema as unknown as z.ZodType<Prisma.EmploymentWhereInput>;
export const EmploymentWhereInputObjectZodSchema = employmentwhereinputSchema;
