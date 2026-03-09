import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationUpdateWithoutDeptEmploymentsInputObjectSchema as OrganizationUpdateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUpdateWithoutDeptEmploymentsInput.schema';
import { OrganizationUncheckedUpdateWithoutDeptEmploymentsInputObjectSchema as OrganizationUncheckedUpdateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUncheckedUpdateWithoutDeptEmploymentsInput.schema';
import { OrganizationCreateWithoutDeptEmploymentsInputObjectSchema as OrganizationCreateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationCreateWithoutDeptEmploymentsInput.schema';
import { OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema as OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUncheckedCreateWithoutDeptEmploymentsInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => OrganizationUpdateWithoutDeptEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutDeptEmploymentsInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationCreateWithoutDeptEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema)]),
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationUpsertWithoutDeptEmploymentsInputObjectSchema: z.ZodType<Prisma.OrganizationUpsertWithoutDeptEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpsertWithoutDeptEmploymentsInput>;
export const OrganizationUpsertWithoutDeptEmploymentsInputObjectZodSchema = makeSchema();
