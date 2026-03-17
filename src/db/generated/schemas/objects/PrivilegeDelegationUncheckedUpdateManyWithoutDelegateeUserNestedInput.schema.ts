import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationCreateManyDelegateeUserInputEnvelopeObjectSchema as PrivilegeDelegationCreateManyDelegateeUserInputEnvelopeObjectSchema } from './PrivilegeDelegationCreateManyDelegateeUserInputEnvelope.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationScalarWhereInputObjectSchema as PrivilegeDelegationScalarWhereInputObjectSchema } from './PrivilegeDelegationScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema).array(), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PrivilegeDelegationCreateManyDelegateeUserInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema), z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserNestedInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserNestedInput>;
export const PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserNestedInputObjectZodSchema = makeSchema();
