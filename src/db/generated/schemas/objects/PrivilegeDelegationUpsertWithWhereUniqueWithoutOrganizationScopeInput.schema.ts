import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUpdateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUpdateWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationUncheckedUpdateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUncheckedUpdateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationCreateWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => PrivilegeDelegationUpdateWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateWithoutOrganizationScopeInputObjectSchema)]),
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpsertWithWhereUniqueWithoutOrganizationScopeInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpsertWithWhereUniqueWithoutOrganizationScopeInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpsertWithWhereUniqueWithoutOrganizationScopeInput>;
export const PrivilegeDelegationUpsertWithWhereUniqueWithoutOrganizationScopeInputObjectZodSchema = makeSchema();
