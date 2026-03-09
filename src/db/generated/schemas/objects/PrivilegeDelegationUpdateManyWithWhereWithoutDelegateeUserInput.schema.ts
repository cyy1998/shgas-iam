import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationScalarWhereInputObjectSchema as PrivilegeDelegationScalarWhereInputObjectSchema } from './PrivilegeDelegationScalarWhereInput.schema';
import { PrivilegeDelegationUpdateManyMutationInputObjectSchema as PrivilegeDelegationUpdateManyMutationInputObjectSchema } from './PrivilegeDelegationUpdateManyMutationInput.schema';
import { PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => PrivilegeDelegationUpdateManyMutationInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInput>;
export const PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInputObjectZodSchema = makeSchema();
