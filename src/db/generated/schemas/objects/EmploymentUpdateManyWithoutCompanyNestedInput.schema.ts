import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutCompanyInputObjectSchema as EmploymentCreateWithoutCompanyInputObjectSchema } from './EmploymentCreateWithoutCompanyInput.schema';
import { EmploymentUncheckedCreateWithoutCompanyInputObjectSchema as EmploymentUncheckedCreateWithoutCompanyInputObjectSchema } from './EmploymentUncheckedCreateWithoutCompanyInput.schema';
import { EmploymentCreateOrConnectWithoutCompanyInputObjectSchema as EmploymentCreateOrConnectWithoutCompanyInputObjectSchema } from './EmploymentCreateOrConnectWithoutCompanyInput.schema';
import { EmploymentUpsertWithWhereUniqueWithoutCompanyInputObjectSchema as EmploymentUpsertWithWhereUniqueWithoutCompanyInputObjectSchema } from './EmploymentUpsertWithWhereUniqueWithoutCompanyInput.schema';
import { EmploymentCreateManyCompanyInputEnvelopeObjectSchema as EmploymentCreateManyCompanyInputEnvelopeObjectSchema } from './EmploymentCreateManyCompanyInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithWhereUniqueWithoutCompanyInputObjectSchema as EmploymentUpdateWithWhereUniqueWithoutCompanyInputObjectSchema } from './EmploymentUpdateWithWhereUniqueWithoutCompanyInput.schema';
import { EmploymentUpdateManyWithWhereWithoutCompanyInputObjectSchema as EmploymentUpdateManyWithWhereWithoutCompanyInputObjectSchema } from './EmploymentUpdateManyWithWhereWithoutCompanyInput.schema';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentCreateWithoutCompanyInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutCompanyInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutCompanyInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutCompanyInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyCompanyInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutCompanyInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => EmploymentUpdateManyWithWhereWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentUpdateManyWithWhereWithoutCompanyInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => EmploymentScalarWhereInputObjectSchema), z.lazy(() => EmploymentScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentUpdateManyWithoutCompanyNestedInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateManyWithoutCompanyNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateManyWithoutCompanyNestedInput>;
export const EmploymentUpdateManyWithoutCompanyNestedInputObjectZodSchema = makeSchema();
