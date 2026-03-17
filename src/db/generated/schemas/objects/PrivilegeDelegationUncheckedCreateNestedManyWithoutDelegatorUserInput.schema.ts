import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationCreateManyDelegatorUserInputEnvelopeObjectSchema as PrivilegeDelegationCreateManyDelegatorUserInputEnvelopeObjectSchema } from './PrivilegeDelegationCreateManyDelegatorUserInputEnvelope.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema).array(), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PrivilegeDelegationCreateManyDelegatorUserInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInput>;
export const PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInputObjectZodSchema = makeSchema();
