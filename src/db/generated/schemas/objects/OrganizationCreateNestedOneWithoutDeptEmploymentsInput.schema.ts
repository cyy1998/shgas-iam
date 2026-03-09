import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutDeptEmploymentsInputObjectSchema as OrganizationCreateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationCreateWithoutDeptEmploymentsInput.schema';
import { OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema as OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUncheckedCreateWithoutDeptEmploymentsInput.schema';
import { OrganizationCreateOrConnectWithoutDeptEmploymentsInputObjectSchema as OrganizationCreateOrConnectWithoutDeptEmploymentsInputObjectSchema } from './OrganizationCreateOrConnectWithoutDeptEmploymentsInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutDeptEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutDeptEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationCreateNestedOneWithoutDeptEmploymentsInputObjectSchema: z.ZodType<Prisma.OrganizationCreateNestedOneWithoutDeptEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateNestedOneWithoutDeptEmploymentsInput>;
export const OrganizationCreateNestedOneWithoutDeptEmploymentsInputObjectZodSchema = makeSchema();
