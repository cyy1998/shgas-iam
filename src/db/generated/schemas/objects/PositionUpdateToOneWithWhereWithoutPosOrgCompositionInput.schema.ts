import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema';
import { PositionUpdateWithoutPosOrgCompositionInputObjectSchema as PositionUpdateWithoutPosOrgCompositionInputObjectSchema } from './PositionUpdateWithoutPosOrgCompositionInput.schema';
import { PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema as PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema } from './PositionUncheckedUpdateWithoutPosOrgCompositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => PositionUpdateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema)])
}).strict();
export const PositionUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.PositionUpdateToOneWithWhereWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpdateToOneWithWhereWithoutPosOrgCompositionInput>;
export const PositionUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
