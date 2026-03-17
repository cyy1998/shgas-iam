import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionCountOutputTypeCountEmploymentsArgsObjectSchema as PositionCountOutputTypeCountEmploymentsArgsObjectSchema } from './PositionCountOutputTypeCountEmploymentsArgs.schema';
import { PositionCountOutputTypeCountRolesArgsObjectSchema as PositionCountOutputTypeCountRolesArgsObjectSchema } from './PositionCountOutputTypeCountRolesArgs.schema';
import { PositionCountOutputTypeCountPosOrgCompositionArgsObjectSchema as PositionCountOutputTypeCountPosOrgCompositionArgsObjectSchema } from './PositionCountOutputTypeCountPosOrgCompositionArgs.schema'

const makeSchema = () => z.object({
  employments: z.union([z.boolean(), z.lazy(() => PositionCountOutputTypeCountEmploymentsArgsObjectSchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => PositionCountOutputTypeCountRolesArgsObjectSchema)]).optional(),
  posOrgComposition: z.union([z.boolean(), z.lazy(() => PositionCountOutputTypeCountPosOrgCompositionArgsObjectSchema)]).optional()
}).strict();
export const PositionCountOutputTypeSelectObjectSchema: z.ZodType<Prisma.PositionCountOutputTypeSelect> = makeSchema() as unknown as z.ZodType<Prisma.PositionCountOutputTypeSelect>;
export const PositionCountOutputTypeSelectObjectZodSchema = makeSchema();
