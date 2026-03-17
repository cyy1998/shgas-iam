import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionCreateWithoutEmploymentsInputObjectSchema as PositionCreateWithoutEmploymentsInputObjectSchema } from './PositionCreateWithoutEmploymentsInput.schema';
import { PositionUncheckedCreateWithoutEmploymentsInputObjectSchema as PositionUncheckedCreateWithoutEmploymentsInputObjectSchema } from './PositionUncheckedCreateWithoutEmploymentsInput.schema';
import { PositionCreateOrConnectWithoutEmploymentsInputObjectSchema as PositionCreateOrConnectWithoutEmploymentsInputObjectSchema } from './PositionCreateOrConnectWithoutEmploymentsInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './PositionWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PositionCreateOrConnectWithoutEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => PositionWhereUniqueInputObjectSchema).optional()
}).strict();
export const PositionCreateNestedOneWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PositionCreateNestedOneWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateNestedOneWithoutEmploymentsInput>;
export const PositionCreateNestedOneWithoutEmploymentsInputObjectZodSchema = makeSchema();
