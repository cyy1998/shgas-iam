import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentFindManySchema as EmploymentFindManySchema } from '../findManyEmployment.schema';
import { PositionRoleFindManySchema as PositionRoleFindManySchema } from '../findManyPositionRole.schema';
import { PosOrgCompositionFindManySchema as PosOrgCompositionFindManySchema } from '../findManyPosOrgComposition.schema';
import { PositionCountOutputTypeArgsObjectSchema as PositionCountOutputTypeArgsObjectSchema } from './PositionCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  id: z.boolean().optional(),
  posCode: z.boolean().optional(),
  posName: z.boolean().optional(),
  status: z.boolean().optional(),
  description: z.boolean().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.boolean().optional(),
  updateTime: z.boolean().optional(),
  employments: z.union([z.boolean(), z.lazy(() => EmploymentFindManySchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => PositionRoleFindManySchema)]).optional(),
  posOrgComposition: z.union([z.boolean(), z.lazy(() => PosOrgCompositionFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => PositionCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const PositionSelectObjectSchema: z.ZodType<Prisma.PositionSelect> = makeSchema() as unknown as z.ZodType<Prisma.PositionSelect>;
export const PositionSelectObjectZodSchema = makeSchema();
