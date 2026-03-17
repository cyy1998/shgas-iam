import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleCreateWithoutRoleInputObjectSchema as EmploymentRoleCreateWithoutRoleInputObjectSchema } from './EmploymentRoleCreateWithoutRoleInput.schema';
import { EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema as EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema } from './EmploymentRoleUncheckedCreateWithoutRoleInput.schema';
import { EmploymentRoleCreateOrConnectWithoutRoleInputObjectSchema as EmploymentRoleCreateOrConnectWithoutRoleInputObjectSchema } from './EmploymentRoleCreateOrConnectWithoutRoleInput.schema';
import { EmploymentRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema as EmploymentRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema } from './EmploymentRoleUpsertWithWhereUniqueWithoutRoleInput.schema';
import { EmploymentRoleCreateManyRoleInputEnvelopeObjectSchema as EmploymentRoleCreateManyRoleInputEnvelopeObjectSchema } from './EmploymentRoleCreateManyRoleInputEnvelope.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema as EmploymentRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema } from './EmploymentRoleUpdateWithWhereUniqueWithoutRoleInput.schema';
import { EmploymentRoleUpdateManyWithWhereWithoutRoleInputObjectSchema as EmploymentRoleUpdateManyWithWhereWithoutRoleInputObjectSchema } from './EmploymentRoleUpdateManyWithWhereWithoutRoleInput.schema';
import { EmploymentRoleScalarWhereInputObjectSchema as EmploymentRoleScalarWhereInputObjectSchema } from './EmploymentRoleScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentRoleCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => EmploymentRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentRoleCreateManyRoleInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema), z.lazy(() => EmploymentRoleWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => EmploymentRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => EmploymentRoleUpdateManyWithWhereWithoutRoleInputObjectSchema), z.lazy(() => EmploymentRoleUpdateManyWithWhereWithoutRoleInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema), z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentRoleUpdateManyWithoutRoleNestedInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateManyWithoutRoleNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateManyWithoutRoleNestedInput>;
export const EmploymentRoleUpdateManyWithoutRoleNestedInputObjectZodSchema = makeSchema();
