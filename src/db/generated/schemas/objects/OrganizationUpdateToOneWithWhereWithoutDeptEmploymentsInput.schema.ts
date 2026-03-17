import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { OrganizationUpdateWithoutDeptEmploymentsInputObjectSchema as OrganizationUpdateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUpdateWithoutDeptEmploymentsInput.schema';
import { OrganizationUncheckedUpdateWithoutDeptEmploymentsInputObjectSchema as OrganizationUncheckedUpdateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUncheckedUpdateWithoutDeptEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => OrganizationUpdateWithoutDeptEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutDeptEmploymentsInputObjectSchema)])
}).strict();
export const OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInput>;
export const OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInputObjectZodSchema = makeSchema();
