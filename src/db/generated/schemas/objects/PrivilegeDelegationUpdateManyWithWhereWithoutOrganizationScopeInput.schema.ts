import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationScalarWhereInputObjectSchema as PrivilegeDelegationScalarWhereInputObjectSchema } from './PrivilegeDelegationScalarWhereInput.schema';
import { PrivilegeDelegationUpdateManyMutationInputObjectSchema as PrivilegeDelegationUpdateManyMutationInputObjectSchema } from './PrivilegeDelegationUpdateManyMutationInput.schema';
import { PrivilegeDelegationUncheckedUpdateManyWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUncheckedUpdateManyWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateManyWithoutOrganizationScopeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => PrivilegeDelegationUpdateManyMutationInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateManyWithoutOrganizationScopeInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpdateManyWithWhereWithoutOrganizationScopeInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateManyWithWhereWithoutOrganizationScopeInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateManyWithWhereWithoutOrganizationScopeInput>;
export const PrivilegeDelegationUpdateManyWithWhereWithoutOrganizationScopeInputObjectZodSchema = makeSchema();
