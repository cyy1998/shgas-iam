import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionUpdateWithoutOrganizationInputObjectSchema as PosOrgCompositionUpdateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUpdateWithoutOrganizationInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutOrganizationInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutOrganizationInput.schema';
import { PosOrgCompositionCreateWithoutOrganizationInputObjectSchema as PosOrgCompositionCreateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionCreateWithoutOrganizationInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutOrganizationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => PosOrgCompositionUpdateWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutOrganizationInputObjectSchema)]),
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema)])
}).strict();
export const PosOrgCompositionUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpsertWithWhereUniqueWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpsertWithWhereUniqueWithoutOrganizationInput>;
export const PosOrgCompositionUpsertWithWhereUniqueWithoutOrganizationInputObjectZodSchema = makeSchema();
