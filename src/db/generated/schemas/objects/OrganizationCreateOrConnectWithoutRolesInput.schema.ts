import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationCreateWithoutRolesInputObjectSchema as OrganizationCreateWithoutRolesInputObjectSchema } from './OrganizationCreateWithoutRolesInput.schema';
import { OrganizationUncheckedCreateWithoutRolesInputObjectSchema as OrganizationUncheckedCreateWithoutRolesInputObjectSchema } from './OrganizationUncheckedCreateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationCreateWithoutRolesInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutRolesInputObjectSchema)])
}).strict();
export const OrganizationCreateOrConnectWithoutRolesInputObjectSchema: z.ZodType<Prisma.OrganizationCreateOrConnectWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateOrConnectWithoutRolesInput>;
export const OrganizationCreateOrConnectWithoutRolesInputObjectZodSchema = makeSchema();
