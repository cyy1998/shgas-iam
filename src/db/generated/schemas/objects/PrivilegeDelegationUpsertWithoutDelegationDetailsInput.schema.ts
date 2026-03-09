import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationUpdateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUpdateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUpdateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './PrivilegeDelegationWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => PrivilegeDelegationUpdateWithoutDelegationDetailsInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInputObjectSchema)]),
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegationDetailsInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema)]),
  where: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationUpsertWithoutDelegationDetailsInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpsertWithoutDelegationDetailsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpsertWithoutDelegationDetailsInput>;
export const PrivilegeDelegationUpsertWithoutDelegationDetailsInputObjectZodSchema = makeSchema();
