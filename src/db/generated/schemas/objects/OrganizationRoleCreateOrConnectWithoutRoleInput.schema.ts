import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleCreateWithoutRoleInputObjectSchema as OrganizationRoleCreateWithoutRoleInputObjectSchema } from './OrganizationRoleCreateWithoutRoleInput.schema';
import { OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema as OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const OrganizationRoleCreateOrConnectWithoutRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateOrConnectWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateOrConnectWithoutRoleInput>;
export const OrganizationRoleCreateOrConnectWithoutRoleInputObjectZodSchema = makeSchema();
