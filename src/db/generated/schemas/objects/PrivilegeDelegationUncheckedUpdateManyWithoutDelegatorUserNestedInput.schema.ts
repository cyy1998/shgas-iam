import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationCreateManyDelegatorUserInputEnvelopeObjectSchema as PrivilegeDelegationCreateManyDelegatorUserInputEnvelopeObjectSchema } from './PrivilegeDelegationCreateManyDelegatorUserInputEnvelope.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationScalarWhereInputObjectSchema as PrivilegeDelegationScalarWhereInputObjectSchema } from './PrivilegeDelegationScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema).array(), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PrivilegeDelegationCreateManyDelegatorUserInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema), z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInput>;
export const PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInputObjectZodSchema = makeSchema();
