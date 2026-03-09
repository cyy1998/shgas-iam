import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema)])
}).strict();
export const PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput>;
export const PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInputObjectZodSchema = makeSchema();
