import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionUpdateWithoutPositionInputObjectSchema as PosOrgCompositionUpdateWithoutPositionInputObjectSchema } from './PosOrgCompositionUpdateWithoutPositionInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutPositionInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutPositionInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => PosOrgCompositionUpdateWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutPositionInputObjectSchema)])
}).strict();
export const PosOrgCompositionUpdateWithWhereUniqueWithoutPositionInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateWithWhereUniqueWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateWithWhereUniqueWithoutPositionInput>;
export const PosOrgCompositionUpdateWithWhereUniqueWithoutPositionInputObjectZodSchema = makeSchema();
