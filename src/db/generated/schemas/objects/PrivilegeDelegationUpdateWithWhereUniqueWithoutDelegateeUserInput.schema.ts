import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUpdateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUpdateWithoutDelegateeUserInput.schema';
import { PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => PrivilegeDelegationUpdateWithoutDelegateeUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInput>;
export const PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInputObjectZodSchema = makeSchema();
