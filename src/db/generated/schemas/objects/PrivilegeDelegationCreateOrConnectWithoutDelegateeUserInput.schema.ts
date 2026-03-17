import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema)])
}).strict();
export const PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput>;
export const PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInputObjectZodSchema = makeSchema();
