import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleUpdateWithoutRoleInputObjectSchema as OrganizationRoleUpdateWithoutRoleInputObjectSchema } from './OrganizationRoleUpdateWithoutRoleInput.schema';
import { OrganizationRoleUncheckedUpdateWithoutRoleInputObjectSchema as OrganizationRoleUncheckedUpdateWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedUpdateWithoutRoleInput.schema';
import { OrganizationRoleCreateWithoutRoleInputObjectSchema as OrganizationRoleCreateWithoutRoleInputObjectSchema } from './OrganizationRoleCreateWithoutRoleInput.schema';
import { OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema as OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => OrganizationRoleUpdateWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedUpdateWithoutRoleInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const OrganizationRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpsertWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpsertWithWhereUniqueWithoutRoleInput>;
export const OrganizationRoleUpsertWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
