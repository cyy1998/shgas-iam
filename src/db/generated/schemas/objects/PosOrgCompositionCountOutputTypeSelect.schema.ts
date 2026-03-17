import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCountOutputTypeCountEmploymentsArgsObjectSchema as PosOrgCompositionCountOutputTypeCountEmploymentsArgsObjectSchema } from './PosOrgCompositionCountOutputTypeCountEmploymentsArgs.schema';
import { PosOrgCompositionCountOutputTypeCountRolesArgsObjectSchema as PosOrgCompositionCountOutputTypeCountRolesArgsObjectSchema } from './PosOrgCompositionCountOutputTypeCountRolesArgs.schema'

const makeSchema = () => z.object({
  employments: z.union([z.boolean(), z.lazy(() => PosOrgCompositionCountOutputTypeCountEmploymentsArgsObjectSchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => PosOrgCompositionCountOutputTypeCountRolesArgsObjectSchema)]).optional()
}).strict();
export const PosOrgCompositionCountOutputTypeSelectObjectSchema: z.ZodType<Prisma.PosOrgCompositionCountOutputTypeSelect> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCountOutputTypeSelect>;
export const PosOrgCompositionCountOutputTypeSelectObjectZodSchema = makeSchema();
