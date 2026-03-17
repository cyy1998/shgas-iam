import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationUpdateWithoutCompEmploymentsInputObjectSchema as OrganizationUpdateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUpdateWithoutCompEmploymentsInput.schema';
import { OrganizationUncheckedUpdateWithoutCompEmploymentsInputObjectSchema as OrganizationUncheckedUpdateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUncheckedUpdateWithoutCompEmploymentsInput.schema';
import { OrganizationCreateWithoutCompEmploymentsInputObjectSchema as OrganizationCreateWithoutCompEmploymentsInputObjectSchema } from './OrganizationCreateWithoutCompEmploymentsInput.schema';
import { OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema as OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUncheckedCreateWithoutCompEmploymentsInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => OrganizationUpdateWithoutCompEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutCompEmploymentsInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationCreateWithoutCompEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema)]),
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationUpsertWithoutCompEmploymentsInputObjectSchema: z.ZodType<Prisma.OrganizationUpsertWithoutCompEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpsertWithoutCompEmploymentsInput>;
export const OrganizationUpsertWithoutCompEmploymentsInputObjectZodSchema = makeSchema();
