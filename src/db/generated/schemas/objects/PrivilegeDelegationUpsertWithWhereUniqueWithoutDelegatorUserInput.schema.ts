import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUpdateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUpdateWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationCreateWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => PrivilegeDelegationUpdateWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInputObjectSchema)]),
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInput>;
export const PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInputObjectZodSchema = makeSchema();
