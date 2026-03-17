import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionCreateWithoutOrganizationInputObjectSchema as PosOrgCompositionCreateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionCreateWithoutOrganizationInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutOrganizationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema)])
}).strict();
export const PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateOrConnectWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateOrConnectWithoutOrganizationInput>;
export const PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectZodSchema = makeSchema();
