import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionArgsObjectSchema as PositionArgsObjectSchema } from './PositionArgs.schema';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema';
import { EmploymentFindManySchema as EmploymentFindManySchema } from '../findManyEmployment.schema';
import { PosOrgRoleFindManySchema as PosOrgRoleFindManySchema } from '../findManyPosOrgRole.schema';
import { PosOrgCompositionCountOutputTypeArgsObjectSchema as PosOrgCompositionCountOutputTypeArgsObjectSchema } from './PosOrgCompositionCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  id: z.boolean().optional(),
  posId: z.boolean().optional(),
  orgId: z.boolean().optional(),
  status: z.boolean().optional(),
  description: z.boolean().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.boolean().optional(),
  updateTime: z.boolean().optional(),
  position: z.union([z.boolean(), z.lazy(() => PositionArgsObjectSchema)]).optional(),
  organization: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  employments: z.union([z.boolean(), z.lazy(() => EmploymentFindManySchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => PosOrgRoleFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => PosOrgCompositionCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const PosOrgCompositionSelectObjectSchema: z.ZodType<Prisma.PosOrgCompositionSelect> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionSelect>;
export const PosOrgCompositionSelectObjectZodSchema = makeSchema();
