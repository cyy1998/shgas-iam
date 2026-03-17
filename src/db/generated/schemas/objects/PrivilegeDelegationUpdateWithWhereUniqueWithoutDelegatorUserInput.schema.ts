import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUpdateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUpdateWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => PrivilegeDelegationUpdateWithoutDelegatorUserInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInput>;
export const PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInputObjectZodSchema = makeSchema();
