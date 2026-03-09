import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateWithoutOrganizationInputObjectSchema as PosOrgCompositionCreateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionCreateWithoutOrganizationInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutOrganizationInput.schema';
import { PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectSchema as PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectSchema } from './PosOrgCompositionCreateOrConnectWithoutOrganizationInput.schema';
import { PosOrgCompositionUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema as PosOrgCompositionUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUpsertWithWhereUniqueWithoutOrganizationInput.schema';
import { PosOrgCompositionCreateManyOrganizationInputEnvelopeObjectSchema as PosOrgCompositionCreateManyOrganizationInputEnvelopeObjectSchema } from './PosOrgCompositionCreateManyOrganizationInputEnvelope.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema as PosOrgCompositionUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUpdateWithWhereUniqueWithoutOrganizationInput.schema';
import { PosOrgCompositionUpdateManyWithWhereWithoutOrganizationInputObjectSchema as PosOrgCompositionUpdateManyWithWhereWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUpdateManyWithWhereWithoutOrganizationInput.schema';
import { PosOrgCompositionScalarWhereInputObjectSchema as PosOrgCompositionScalarWhereInputObjectSchema } from './PosOrgCompositionScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionCreateWithoutOrganizationInputObjectSchema).array(), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutOrganizationInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionCreateOrConnectWithoutOrganizationInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => PosOrgCompositionUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PosOrgCompositionCreateManyOrganizationInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => PosOrgCompositionUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => PosOrgCompositionUpdateManyWithWhereWithoutOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionUpdateManyWithWhereWithoutOrganizationInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => PosOrgCompositionScalarWhereInputObjectSchema), z.lazy(() => PosOrgCompositionScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const PosOrgCompositionUpdateManyWithoutOrganizationNestedInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateManyWithoutOrganizationNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateManyWithoutOrganizationNestedInput>;
export const PosOrgCompositionUpdateManyWithoutOrganizationNestedInputObjectZodSchema = makeSchema();
