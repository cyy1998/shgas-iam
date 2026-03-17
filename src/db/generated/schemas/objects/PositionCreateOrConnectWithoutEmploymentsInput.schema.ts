import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './PositionWhereUniqueInput.schema';
import { PositionCreateWithoutEmploymentsInputObjectSchema as PositionCreateWithoutEmploymentsInputObjectSchema } from './PositionCreateWithoutEmploymentsInput.schema';
import { PositionUncheckedCreateWithoutEmploymentsInputObjectSchema as PositionUncheckedCreateWithoutEmploymentsInputObjectSchema } from './PositionUncheckedCreateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PositionCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutEmploymentsInputObjectSchema)])
}).strict();
export const PositionCreateOrConnectWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PositionCreateOrConnectWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateOrConnectWithoutEmploymentsInput>;
export const PositionCreateOrConnectWithoutEmploymentsInputObjectZodSchema = makeSchema();
