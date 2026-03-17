import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleUpdateWithoutOrganizationInputObjectSchema as OrganizationRoleUpdateWithoutOrganizationInputObjectSchema } from './OrganizationRoleUpdateWithoutOrganizationInput.schema';
import { OrganizationRoleUncheckedUpdateWithoutOrganizationInputObjectSchema as OrganizationRoleUncheckedUpdateWithoutOrganizationInputObjectSchema } from './OrganizationRoleUncheckedUpdateWithoutOrganizationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationRoleUpdateWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedUpdateWithoutOrganizationInputObjectSchema)])
}).strict();
export const OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInput>;
export const OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInputObjectZodSchema = makeSchema();
