import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutDeptartmentInputObjectSchema as EmploymentCreateWithoutDeptartmentInputObjectSchema } from './EmploymentCreateWithoutDeptartmentInput.schema';
import { EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema as EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema } from './EmploymentUncheckedCreateWithoutDeptartmentInput.schema';
import { EmploymentCreateOrConnectWithoutDeptartmentInputObjectSchema as EmploymentCreateOrConnectWithoutDeptartmentInputObjectSchema } from './EmploymentCreateOrConnectWithoutDeptartmentInput.schema';
import { EmploymentUpsertWithWhereUniqueWithoutDeptartmentInputObjectSchema as EmploymentUpsertWithWhereUniqueWithoutDeptartmentInputObjectSchema } from './EmploymentUpsertWithWhereUniqueWithoutDeptartmentInput.schema';
import { EmploymentCreateManyDeptartmentInputEnvelopeObjectSchema as EmploymentCreateManyDeptartmentInputEnvelopeObjectSchema } from './EmploymentCreateManyDeptartmentInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithWhereUniqueWithoutDeptartmentInputObjectSchema as EmploymentUpdateWithWhereUniqueWithoutDeptartmentInputObjectSchema } from './EmploymentUpdateWithWhereUniqueWithoutDeptartmentInput.schema';
import { EmploymentUpdateManyWithWhereWithoutDeptartmentInputObjectSchema as EmploymentUpdateManyWithWhereWithoutDeptartmentInputObjectSchema } from './EmploymentUpdateManyWithWhereWithoutDeptartmentInput.schema';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentCreateWithoutDeptartmentInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutDeptartmentInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutDeptartmentInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutDeptartmentInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyDeptartmentInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutDeptartmentInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => EmploymentUpdateManyWithWhereWithoutDeptartmentInputObjectSchema), z.lazy(() => EmploymentUpdateManyWithWhereWithoutDeptartmentInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => EmploymentScalarWhereInputObjectSchema), z.lazy(() => EmploymentScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInputObjectSchema: z.ZodType<Prisma.EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInput>;
export const EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInputObjectZodSchema = makeSchema();
