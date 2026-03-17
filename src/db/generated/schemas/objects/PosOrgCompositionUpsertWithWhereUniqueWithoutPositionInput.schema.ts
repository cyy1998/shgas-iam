import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionUpdateWithoutPositionInputObjectSchema as PosOrgCompositionUpdateWithoutPositionInputObjectSchema } from './PosOrgCompositionUpdateWithoutPositionInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutPositionInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutPositionInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutPositionInput.schema';
import { PosOrgCompositionCreateWithoutPositionInputObjectSchema as PosOrgCompositionCreateWithoutPositionInputObjectSchema } from './PosOrgCompositionCreateWithoutPositionInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => PosOrgCompositionUpdateWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutPositionInputObjectSchema)]),
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema)])
}).strict();
export const PosOrgCompositionUpsertWithWhereUniqueWithoutPositionInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpsertWithWhereUniqueWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpsertWithWhereUniqueWithoutPositionInput>;
export const PosOrgCompositionUpsertWithWhereUniqueWithoutPositionInputObjectZodSchema = makeSchema();
