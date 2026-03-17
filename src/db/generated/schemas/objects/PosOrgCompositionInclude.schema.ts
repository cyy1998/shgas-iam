import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionArgsObjectSchema as PositionArgsObjectSchema } from './PositionArgs.schema';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema';
import { EmploymentFindManySchema as EmploymentFindManySchema } from '../findManyEmployment.schema';
import { PosOrgRoleFindManySchema as PosOrgRoleFindManySchema } from '../findManyPosOrgRole.schema';
import { PosOrgCompositionCountOutputTypeArgsObjectSchema as PosOrgCompositionCountOutputTypeArgsObjectSchema } from './PosOrgCompositionCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  position: z.union([z.boolean(), z.lazy(() => PositionArgsObjectSchema)]).optional(),
  organization: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  employments: z.union([z.boolean(), z.lazy(() => EmploymentFindManySchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => PosOrgRoleFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => PosOrgCompositionCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const PosOrgCompositionIncludeObjectSchema: z.ZodType<Prisma.PosOrgCompositionInclude> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionInclude>;
export const PosOrgCompositionIncludeObjectZodSchema = makeSchema();
