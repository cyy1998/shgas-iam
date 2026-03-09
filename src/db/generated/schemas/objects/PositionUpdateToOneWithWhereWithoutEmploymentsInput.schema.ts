import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema';
import { PositionUpdateWithoutEmploymentsInputObjectSchema as PositionUpdateWithoutEmploymentsInputObjectSchema } from './PositionUpdateWithoutEmploymentsInput.schema';
import { PositionUncheckedUpdateWithoutEmploymentsInputObjectSchema as PositionUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './PositionUncheckedUpdateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => PositionUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => PositionUncheckedUpdateWithoutEmploymentsInputObjectSchema)])
}).strict();
export const PositionUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PositionUpdateToOneWithWhereWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpdateToOneWithWhereWithoutEmploymentsInput>;
export const PositionUpdateToOneWithWhereWithoutEmploymentsInputObjectZodSchema = makeSchema();
