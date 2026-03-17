import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationCreateWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema)])
}).strict();
export const PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInput>;
export const PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectZodSchema = makeSchema();
