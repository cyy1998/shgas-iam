import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleUpdateWithoutRoleInputObjectSchema as OrganizationRoleUpdateWithoutRoleInputObjectSchema } from './OrganizationRoleUpdateWithoutRoleInput.schema';
import { OrganizationRoleUncheckedUpdateWithoutRoleInputObjectSchema as OrganizationRoleUncheckedUpdateWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedUpdateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationRoleUpdateWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedUpdateWithoutRoleInputObjectSchema)])
}).strict();
export const OrganizationRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateWithWhereUniqueWithoutRoleInput>;
export const OrganizationRoleUpdateWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
