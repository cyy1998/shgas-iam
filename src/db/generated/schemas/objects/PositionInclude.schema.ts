import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentFindManySchema as EmploymentFindManySchema } from '../findManyEmployment.schema';
import { PositionRoleFindManySchema as PositionRoleFindManySchema } from '../findManyPositionRole.schema';
import { PosOrgCompositionFindManySchema as PosOrgCompositionFindManySchema } from '../findManyPosOrgComposition.schema';
import { PositionCountOutputTypeArgsObjectSchema as PositionCountOutputTypeArgsObjectSchema } from './PositionCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  employments: z.union([z.boolean(), z.lazy(() => EmploymentFindManySchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => PositionRoleFindManySchema)]).optional(),
  posOrgComposition: z.union([z.boolean(), z.lazy(() => PosOrgCompositionFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => PositionCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const PositionIncludeObjectSchema: z.ZodType<Prisma.PositionInclude> = makeSchema() as unknown as z.ZodType<Prisma.PositionInclude>;
export const PositionIncludeObjectZodSchema = makeSchema();
