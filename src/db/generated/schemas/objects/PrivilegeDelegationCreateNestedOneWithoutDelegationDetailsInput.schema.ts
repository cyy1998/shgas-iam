import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInputObjectSchema).optional(),
  connect: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInput>;
export const PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInputObjectZodSchema = makeSchema();
