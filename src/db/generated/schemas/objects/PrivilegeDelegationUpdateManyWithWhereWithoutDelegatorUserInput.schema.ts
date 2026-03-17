import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationScalarWhereInputObjectSchema as PrivilegeDelegationScalarWhereInputObjectSchema } from './PrivilegeDelegationScalarWhereInput.schema';
import { PrivilegeDelegationUpdateManyMutationInputObjectSchema as PrivilegeDelegationUpdateManyMutationInputObjectSchema } from './PrivilegeDelegationUpdateManyMutationInput.schema';
import { PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => PrivilegeDelegationUpdateManyMutationInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInput>;
export const PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInputObjectZodSchema = makeSchema();
