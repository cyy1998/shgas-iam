import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationUpdateWithoutRolesInputObjectSchema as OrganizationUpdateWithoutRolesInputObjectSchema } from './OrganizationUpdateWithoutRolesInput.schema';
import { OrganizationUncheckedUpdateWithoutRolesInputObjectSchema as OrganizationUncheckedUpdateWithoutRolesInputObjectSchema } from './OrganizationUncheckedUpdateWithoutRolesInput.schema';
import { OrganizationCreateWithoutRolesInputObjectSchema as OrganizationCreateWithoutRolesInputObjectSchema } from './OrganizationCreateWithoutRolesInput.schema';
import { OrganizationUncheckedCreateWithoutRolesInputObjectSchema as OrganizationUncheckedCreateWithoutRolesInputObjectSchema } from './OrganizationUncheckedCreateWithoutRolesInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => OrganizationUpdateWithoutRolesInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutRolesInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationCreateWithoutRolesInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutRolesInputObjectSchema)]),
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationUpsertWithoutRolesInputObjectSchema: z.ZodType<Prisma.OrganizationUpsertWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpsertWithoutRolesInput>;
export const OrganizationUpsertWithoutRolesInputObjectZodSchema = makeSchema();
