import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleCreateWithoutEmploymentInputObjectSchema as EmploymentRoleCreateWithoutEmploymentInputObjectSchema } from './EmploymentRoleCreateWithoutEmploymentInput.schema';
import { EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema as EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema } from './EmploymentRoleUncheckedCreateWithoutEmploymentInput.schema';
import { EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectSchema as EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectSchema } from './EmploymentRoleCreateOrConnectWithoutEmploymentInput.schema';
import { EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInputObjectSchema as EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInputObjectSchema } from './EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInput.schema';
import { EmploymentRoleCreateManyEmploymentInputEnvelopeObjectSchema as EmploymentRoleCreateManyEmploymentInputEnvelopeObjectSchema } from './EmploymentRoleCreateManyEmploymentInputEnvelope.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInputObjectSchema as EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInputObjectSchema } from './EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInput.schema';
import { EmploymentRoleUpdateManyWithWhereWithoutEmploymentInputObjectSchema as EmploymentRoleUpdateManyWithWhereWithoutEmploymentInputObjectSchema } from './EmploymentRoleUpdateManyWithWhereWithoutEmploymentInput.schema';
import { EmploymentRoleScalarWhereInputObjectSchema as EmploymentRoleScalarWhereInputObjectSchema } from './EmploymentRoleScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentRoleCreateWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleCreateWithoutEmploymentInputObjectSchema).array(), z.lazy(() => EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleCreateOrConnectWithoutEmploymentInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentRoleCreateManyEmploymentInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => EmploymentRoleUpdateManyWithWhereWithoutEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleUpdateManyWithWhereWithoutEmploymentInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema), z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentRoleUpdateManyWithoutEmploymentNestedInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateManyWithoutEmploymentNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateManyWithoutEmploymentNestedInput>;
export const EmploymentRoleUpdateManyWithoutEmploymentNestedInputObjectZodSchema = makeSchema();
