import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleCreateWithoutOrganizationInputObjectSchema as OrganizationRoleCreateWithoutOrganizationInputObjectSchema } from './OrganizationRoleCreateWithoutOrganizationInput.schema';
import { OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema as OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema } from './OrganizationRoleUncheckedCreateWithoutOrganizationInput.schema';
import { OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectSchema as OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectSchema } from './OrganizationRoleCreateOrConnectWithoutOrganizationInput.schema';
import { OrganizationRoleCreateManyOrganizationInputEnvelopeObjectSchema as OrganizationRoleCreateManyOrganizationInputEnvelopeObjectSchema } from './OrganizationRoleCreateManyOrganizationInputEnvelope.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationRoleCreateWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleCreateWithoutOrganizationInputObjectSchema).array(), z.lazy(() => OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationRoleCreateManyOrganizationInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInput>;
export const OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInputObjectZodSchema = makeSchema();
