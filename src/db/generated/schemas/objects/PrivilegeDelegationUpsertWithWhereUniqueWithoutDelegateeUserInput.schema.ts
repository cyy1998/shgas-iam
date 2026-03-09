import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUpdateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUpdateWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => PrivilegeDelegationUpdateWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInputObjectSchema)]),
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInput>;
export const PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInputObjectZodSchema = makeSchema();
