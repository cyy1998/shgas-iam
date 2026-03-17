import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionUpdateWithoutOrganizationInputObjectSchema as PosOrgCompositionUpdateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUpdateWithoutOrganizationInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutOrganizationInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutOrganizationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => PosOrgCompositionUpdateWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutOrganizationInputObjectSchema)])
}).strict();
export const PosOrgCompositionUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateWithWhereUniqueWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateWithWhereUniqueWithoutOrganizationInput>;
export const PosOrgCompositionUpdateWithWhereUniqueWithoutOrganizationInputObjectZodSchema = makeSchema();
