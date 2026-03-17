import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { UserArgsObjectSchema as UserArgsObjectSchema } from './UserArgs.schema';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema';
import { PositionArgsObjectSchema as PositionArgsObjectSchema } from './PositionArgs.schema';
import { PosOrgCompositionArgsObjectSchema as PosOrgCompositionArgsObjectSchema } from './PosOrgCompositionArgs.schema';
import { EmploymentRoleFindManySchema as EmploymentRoleFindManySchema } from '../findManyEmploymentRole.schema';
import { EmploymentCountOutputTypeArgsObjectSchema as EmploymentCountOutputTypeArgsObjectSchema } from './EmploymentCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  id: z.boolean().optional(),
  userId: z.boolean().optional(),
  posId: z.boolean().optional(),
  deptId: z.boolean().optional(),
  compId: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  status: z.boolean().optional(),
  startTime: z.boolean().optional(),
  endTime: z.boolean().optional(),
  description: z.boolean().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.boolean().optional(),
  updateTime: z.boolean().optional(),
  user: z.union([z.boolean(), z.lazy(() => UserArgsObjectSchema)]).optional(),
  deptartment: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  company: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  position: z.union([z.boolean(), z.lazy(() => PositionArgsObjectSchema)]).optional(),
  posOrg: z.union([z.boolean(), z.lazy(() => PosOrgCompositionArgsObjectSchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => EmploymentRoleFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => EmploymentCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const EmploymentSelectObjectSchema: z.ZodType<Prisma.EmploymentSelect> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentSelect>;
export const EmploymentSelectObjectZodSchema = makeSchema();
