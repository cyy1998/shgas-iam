import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { OrganizationUpdateWithoutRolesInputObjectSchema as OrganizationUpdateWithoutRolesInputObjectSchema } from './OrganizationUpdateWithoutRolesInput.schema';
import { OrganizationUncheckedUpdateWithoutRolesInputObjectSchema as OrganizationUncheckedUpdateWithoutRolesInputObjectSchema } from './OrganizationUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => OrganizationUpdateWithoutRolesInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutRolesInputObjectSchema)])
}).strict();
export const OrganizationUpdateToOneWithWhereWithoutRolesInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutRolesInput>;
export const OrganizationUpdateToOneWithWhereWithoutRolesInputObjectZodSchema = makeSchema();
