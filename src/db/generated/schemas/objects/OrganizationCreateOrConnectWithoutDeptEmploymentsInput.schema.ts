import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationCreateWithoutDeptEmploymentsInputObjectSchema as OrganizationCreateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationCreateWithoutDeptEmploymentsInput.schema';
import { OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema as OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUncheckedCreateWithoutDeptEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationCreateWithoutDeptEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema)])
}).strict();
export const OrganizationCreateOrConnectWithoutDeptEmploymentsInputObjectSchema: z.ZodType<Prisma.OrganizationCreateOrConnectWithoutDeptEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateOrConnectWithoutDeptEmploymentsInput>;
export const OrganizationCreateOrConnectWithoutDeptEmploymentsInputObjectZodSchema = makeSchema();
