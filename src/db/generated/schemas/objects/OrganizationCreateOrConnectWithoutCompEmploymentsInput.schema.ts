import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationCreateWithoutCompEmploymentsInputObjectSchema as OrganizationCreateWithoutCompEmploymentsInputObjectSchema } from './OrganizationCreateWithoutCompEmploymentsInput.schema';
import { OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema as OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUncheckedCreateWithoutCompEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationCreateWithoutCompEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema)])
}).strict();
export const OrganizationCreateOrConnectWithoutCompEmploymentsInputObjectSchema: z.ZodType<Prisma.OrganizationCreateOrConnectWithoutCompEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateOrConnectWithoutCompEmploymentsInput>;
export const OrganizationCreateOrConnectWithoutCompEmploymentsInputObjectZodSchema = makeSchema();
