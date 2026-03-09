import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutPosOrgInputObjectSchema as EmploymentCreateWithoutPosOrgInputObjectSchema } from './EmploymentCreateWithoutPosOrgInput.schema';
import { EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema as EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema } from './EmploymentUncheckedCreateWithoutPosOrgInput.schema';
import { EmploymentCreateOrConnectWithoutPosOrgInputObjectSchema as EmploymentCreateOrConnectWithoutPosOrgInputObjectSchema } from './EmploymentCreateOrConnectWithoutPosOrgInput.schema';
import { EmploymentUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema as EmploymentUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema } from './EmploymentUpsertWithWhereUniqueWithoutPosOrgInput.schema';
import { EmploymentCreateManyPosOrgInputEnvelopeObjectSchema as EmploymentCreateManyPosOrgInputEnvelopeObjectSchema } from './EmploymentCreateManyPosOrgInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema as EmploymentUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema } from './EmploymentUpdateWithWhereUniqueWithoutPosOrgInput.schema';
import { EmploymentUpdateManyWithWhereWithoutPosOrgInputObjectSchema as EmploymentUpdateManyWithWhereWithoutPosOrgInputObjectSchema } from './EmploymentUpdateManyWithWhereWithoutPosOrgInput.schema';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentCreateWithoutPosOrgInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutPosOrgInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutPosOrgInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyPosOrgInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => EmploymentUpdateManyWithWhereWithoutPosOrgInputObjectSchema), z.lazy(() => EmploymentUpdateManyWithWhereWithoutPosOrgInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => EmploymentScalarWhereInputObjectSchema), z.lazy(() => EmploymentScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentUpdateManyWithoutPosOrgNestedInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateManyWithoutPosOrgNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateManyWithoutPosOrgNestedInput>;
export const EmploymentUpdateManyWithoutPosOrgNestedInputObjectZodSchema = makeSchema();
