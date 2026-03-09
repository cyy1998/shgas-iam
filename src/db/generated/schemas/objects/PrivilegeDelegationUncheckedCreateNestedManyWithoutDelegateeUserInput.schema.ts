import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationCreateManyDelegateeUserInputEnvelopeObjectSchema as PrivilegeDelegationCreateManyDelegateeUserInputEnvelopeObjectSchema } from './PrivilegeDelegationCreateManyDelegateeUserInputEnvelope.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema).array(), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PrivilegeDelegationCreateManyDelegateeUserInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInput>;
export const PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInputObjectZodSchema = makeSchema();
