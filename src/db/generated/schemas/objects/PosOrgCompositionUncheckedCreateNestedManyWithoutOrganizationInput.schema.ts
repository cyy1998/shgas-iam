import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateWithoutOrganizationInputObjectSchema as PosOrgCompositionCreateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionCreateWithoutOrganizationInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutOrganizationInput.schema';
import { PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectSchema as PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectSchema } from './PosOrgCompositionCreateOrConnectWithoutOrganizationInput.schema';
import { PosOrgCompositionCreateManyOrganizationInputEnvelopeObjectSchema as PosOrgCompositionCreateManyOrganizationInputEnvelopeObjectSchema } from './PosOrgCompositionCreateManyOrganizationInputEnvelope.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionCreateWithoutOrganizationInputObjectSchema).array(), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PosOrgCompositionCreateManyOrganizationInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const PosOrgCompositionUncheckedCreateNestedManyWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUncheckedCreateNestedManyWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUncheckedCreateNestedManyWithoutOrganizationInput>;
export const PosOrgCompositionUncheckedCreateNestedManyWithoutOrganizationInputObjectZodSchema = makeSchema();
