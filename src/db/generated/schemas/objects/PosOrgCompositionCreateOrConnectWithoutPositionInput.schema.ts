import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionCreateWithoutPositionInputObjectSchema as PosOrgCompositionCreateWithoutPositionInputObjectSchema } from './PosOrgCompositionCreateWithoutPositionInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema)])
}).strict();
export const PosOrgCompositionCreateOrConnectWithoutPositionInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateOrConnectWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateOrConnectWithoutPositionInput>;
export const PosOrgCompositionCreateOrConnectWithoutPositionInputObjectZodSchema = makeSchema();
