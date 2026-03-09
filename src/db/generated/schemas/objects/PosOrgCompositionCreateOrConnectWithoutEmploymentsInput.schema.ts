import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema as PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionCreateWithoutEmploymentsInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema)])
}).strict();
export const PosOrgCompositionCreateOrConnectWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateOrConnectWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateOrConnectWithoutEmploymentsInput>;
export const PosOrgCompositionCreateOrConnectWithoutEmploymentsInputObjectZodSchema = makeSchema();
