import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutDeptEmploymentsInputObjectSchema as OrganizationCreateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationCreateWithoutDeptEmploymentsInput.schema';
import { OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema as OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUncheckedCreateWithoutDeptEmploymentsInput.schema';
import { OrganizationCreateOrConnectWithoutDeptEmploymentsInputObjectSchema as OrganizationCreateOrConnectWithoutDeptEmploymentsInputObjectSchema } from './OrganizationCreateOrConnectWithoutDeptEmploymentsInput.schema';
import { OrganizationUpsertWithoutDeptEmploymentsInputObjectSchema as OrganizationUpsertWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUpsertWithoutDeptEmploymentsInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInputObjectSchema as OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInput.schema';
import { OrganizationUpdateWithoutDeptEmploymentsInputObjectSchema as OrganizationUpdateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUpdateWithoutDeptEmploymentsInput.schema';
import { OrganizationUncheckedUpdateWithoutDeptEmploymentsInputObjectSchema as OrganizationUncheckedUpdateWithoutDeptEmploymentsInputObjectSchema } from './OrganizationUncheckedUpdateWithoutDeptEmploymentsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutDeptEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutDeptEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutDeptEmploymentsInputObjectSchema).optional(),
  upsert: z.lazy(() => OrganizationUpsertWithoutDeptEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInputObjectSchema), z.lazy(() => OrganizationUpdateWithoutDeptEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutDeptEmploymentsInputObjectSchema)]).optional()
}).strict();
export const OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInput>;
export const OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInputObjectZodSchema = makeSchema();
