import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUpdateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUpdateWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationUncheckedUpdateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUncheckedUpdateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateWithoutOrganizationScopeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => PrivilegeDelegationUpdateWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateWithoutOrganizationScopeInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpdateWithWhereUniqueWithoutOrganizationScopeInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateWithWhereUniqueWithoutOrganizationScopeInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateWithWhereUniqueWithoutOrganizationScopeInput>;
export const PrivilegeDelegationUpdateWithWhereUniqueWithoutOrganizationScopeInputObjectZodSchema = makeSchema();
