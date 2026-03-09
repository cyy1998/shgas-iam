import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationCreateWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationCreateManyOrganizationScopeInputEnvelopeObjectSchema as PrivilegeDelegationCreateManyOrganizationScopeInputEnvelopeObjectSchema } from './PrivilegeDelegationCreateManyOrganizationScopeInputEnvelope.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema).array(), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PrivilegeDelegationCreateManyOrganizationScopeInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const PrivilegeDelegationCreateNestedManyWithoutOrganizationScopeInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateNestedManyWithoutOrganizationScopeInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateNestedManyWithoutOrganizationScopeInput>;
export const PrivilegeDelegationCreateNestedManyWithoutOrganizationScopeInputObjectZodSchema = makeSchema();
