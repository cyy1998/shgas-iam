import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailCreateWithoutPrivilegeInputObjectSchema as DelegationDetailCreateWithoutPrivilegeInputObjectSchema } from './DelegationDetailCreateWithoutPrivilegeInput.schema';
import { DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema as DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema } from './DelegationDetailUncheckedCreateWithoutPrivilegeInput.schema';
import { DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectSchema as DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectSchema } from './DelegationDetailCreateOrConnectWithoutPrivilegeInput.schema';
import { DelegationDetailUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema as DelegationDetailUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema } from './DelegationDetailUpsertWithWhereUniqueWithoutPrivilegeInput.schema';
import { DelegationDetailCreateManyPrivilegeInputEnvelopeObjectSchema as DelegationDetailCreateManyPrivilegeInputEnvelopeObjectSchema } from './DelegationDetailCreateManyPrivilegeInputEnvelope.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema as DelegationDetailUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema } from './DelegationDetailUpdateWithWhereUniqueWithoutPrivilegeInput.schema';
import { DelegationDetailUpdateManyWithWhereWithoutPrivilegeInputObjectSchema as DelegationDetailUpdateManyWithWhereWithoutPrivilegeInputObjectSchema } from './DelegationDetailUpdateManyWithWhereWithoutPrivilegeInput.schema';
import { DelegationDetailScalarWhereInputObjectSchema as DelegationDetailScalarWhereInputObjectSchema } from './DelegationDetailScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => DelegationDetailCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailCreateWithoutPrivilegeInputObjectSchema).array(), z.lazy(() => DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => DelegationDetailUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => DelegationDetailCreateManyPrivilegeInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => DelegationDetailUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => DelegationDetailUpdateManyWithWhereWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailUpdateManyWithWhereWithoutPrivilegeInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => DelegationDetailScalarWhereInputObjectSchema), z.lazy(() => DelegationDetailScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const DelegationDetailUncheckedUpdateManyWithoutPrivilegeNestedInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedUpdateManyWithoutPrivilegeNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedUpdateManyWithoutPrivilegeNestedInput>;
export const DelegationDetailUncheckedUpdateManyWithoutPrivilegeNestedInputObjectZodSchema = makeSchema();
