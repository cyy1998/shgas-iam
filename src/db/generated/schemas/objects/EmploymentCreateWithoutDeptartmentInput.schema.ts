import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { UserCreateNestedOneWithoutEmploymentsInputObjectSchema as UserCreateNestedOneWithoutEmploymentsInputObjectSchema } from './UserCreateNestedOneWithoutEmploymentsInput.schema';
import { OrganizationCreateNestedOneWithoutCompEmploymentsInputObjectSchema as OrganizationCreateNestedOneWithoutCompEmploymentsInputObjectSchema } from './OrganizationCreateNestedOneWithoutCompEmploymentsInput.schema';
import { PositionCreateNestedOneWithoutEmploymentsInputObjectSchema as PositionCreateNestedOneWithoutEmploymentsInputObjectSchema } from './PositionCreateNestedOneWithoutEmploymentsInput.schema';
import { PosOrgCompositionCreateNestedOneWithoutEmploymentsInputObjectSchema as PosOrgCompositionCreateNestedOneWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionCreateNestedOneWithoutEmploymentsInput.schema';
import { EmploymentRoleCreateNestedManyWithoutEmploymentInputObjectSchema as EmploymentRoleCreateNestedManyWithoutEmploymentInputObjectSchema } from './EmploymentRoleCreateNestedManyWithoutEmploymentInput.schema'

const makeSchema = () => z.object({
  isPrimary: z.boolean().optional(),
  status: z.number().int().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  user: z.lazy(() => UserCreateNestedOneWithoutEmploymentsInputObjectSchema),
  company: z.lazy(() => OrganizationCreateNestedOneWithoutCompEmploymentsInputObjectSchema),
  position: z.lazy(() => PositionCreateNestedOneWithoutEmploymentsInputObjectSchema),
  posOrg: z.lazy(() => PosOrgCompositionCreateNestedOneWithoutEmploymentsInputObjectSchema),
  roles: z.lazy(() => EmploymentRoleCreateNestedManyWithoutEmploymentInputObjectSchema).optional()
}).strict();
export const EmploymentCreateWithoutDeptartmentInputObjectSchema: z.ZodType<Prisma.EmploymentCreateWithoutDeptartmentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateWithoutDeptartmentInput>;
export const EmploymentCreateWithoutDeptartmentInputObjectZodSchema = makeSchema();
