import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './PosOrgCompositionWhereInput.schema';
import { PosOrgCompositionUpdateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUpdateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUpdateWithoutEmploymentsInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => PosOrgCompositionUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutEmploymentsInputObjectSchema)])
}).strict();
export const PosOrgCompositionUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateToOneWithWhereWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateToOneWithWhereWithoutEmploymentsInput>;
export const PosOrgCompositionUpdateToOneWithWhereWithoutEmploymentsInputObjectZodSchema = makeSchema();
