import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionUpdateWithoutPosOrgCompositionInputObjectSchema as PositionUpdateWithoutPosOrgCompositionInputObjectSchema } from './PositionUpdateWithoutPosOrgCompositionInput.schema';
import { PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema as PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema } from './PositionUncheckedUpdateWithoutPosOrgCompositionInput.schema';
import { PositionCreateWithoutPosOrgCompositionInputObjectSchema as PositionCreateWithoutPosOrgCompositionInputObjectSchema } from './PositionCreateWithoutPosOrgCompositionInput.schema';
import { PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema as PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema } from './PositionUncheckedCreateWithoutPosOrgCompositionInput.schema';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => PositionUpdateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema)]),
  create: z.union([z.lazy(() => PositionCreateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema)]),
  where: z.lazy(() => PositionWhereInputObjectSchema).optional()
}).strict();
export const PositionUpsertWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.PositionUpsertWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpsertWithoutPosOrgCompositionInput>;
export const PositionUpsertWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
