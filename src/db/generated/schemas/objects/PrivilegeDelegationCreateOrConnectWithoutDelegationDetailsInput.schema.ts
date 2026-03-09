import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema)])
}).strict();
export const PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInput>;
export const PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInputObjectZodSchema = makeSchema();
