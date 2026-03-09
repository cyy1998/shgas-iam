import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './PosOrgCompositionWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional()
}).strict();
export const PositionCountOutputTypeCountPosOrgCompositionArgsObjectSchema = makeSchema();
export const PositionCountOutputTypeCountPosOrgCompositionArgsObjectZodSchema = makeSchema();
