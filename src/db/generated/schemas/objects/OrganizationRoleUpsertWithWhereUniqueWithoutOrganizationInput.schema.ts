import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleUpdateWithoutOrganizationInputObjectSchema as OrganizationRoleUpdateWithoutOrganizationInputObjectSchema } from './OrganizationRoleUpdateWithoutOrganizationInput.schema';
import { OrganizationRoleUncheckedUpdateWithoutOrganizationInputObjectSchema as OrganizationRoleUncheckedUpdateWithoutOrganizationInputObjectSchema } from './OrganizationRoleUncheckedUpdateWithoutOrganizationInput.schema';
import { OrganizationRoleCreateWithoutOrganizationInputObjectSchema as OrganizationRoleCreateWithoutOrganizationInputObjectSchema } from './OrganizationRoleCreateWithoutOrganizationInput.schema';
import { OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema as OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema } from './OrganizationRoleUncheckedCreateWithoutOrganizationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => OrganizationRoleUpdateWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedUpdateWithoutOrganizationInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationRoleCreateWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema)])
}).strict();
export const OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInput>;
export const OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInputObjectZodSchema = makeSchema();
