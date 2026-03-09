import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleCreateWithoutOrganizationInputObjectSchema as OrganizationRoleCreateWithoutOrganizationInputObjectSchema } from './OrganizationRoleCreateWithoutOrganizationInput.schema';
import { OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema as OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema } from './OrganizationRoleUncheckedCreateWithoutOrganizationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationRoleCreateWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema)])
}).strict();
export const OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateOrConnectWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateOrConnectWithoutOrganizationInput>;
export const OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectZodSchema = makeSchema();
