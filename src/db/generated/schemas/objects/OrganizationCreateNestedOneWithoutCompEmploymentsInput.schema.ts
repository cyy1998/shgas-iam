import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutCompEmploymentsInputObjectSchema as OrganizationCreateWithoutCompEmploymentsInputObjectSchema } from './OrganizationCreateWithoutCompEmploymentsInput.schema';
import { OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema as OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUncheckedCreateWithoutCompEmploymentsInput.schema';
import { OrganizationCreateOrConnectWithoutCompEmploymentsInputObjectSchema as OrganizationCreateOrConnectWithoutCompEmploymentsInputObjectSchema } from './OrganizationCreateOrConnectWithoutCompEmploymentsInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutCompEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutCompEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationCreateNestedOneWithoutCompEmploymentsInputObjectSchema: z.ZodType<Prisma.OrganizationCreateNestedOneWithoutCompEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateNestedOneWithoutCompEmploymentsInput>;
export const OrganizationCreateNestedOneWithoutCompEmploymentsInputObjectZodSchema = makeSchema();
