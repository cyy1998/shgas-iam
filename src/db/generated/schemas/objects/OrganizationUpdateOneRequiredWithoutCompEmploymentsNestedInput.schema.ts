import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutCompEmploymentsInputObjectSchema as OrganizationCreateWithoutCompEmploymentsInputObjectSchema } from './OrganizationCreateWithoutCompEmploymentsInput.schema';
import { OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema as OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUncheckedCreateWithoutCompEmploymentsInput.schema';
import { OrganizationCreateOrConnectWithoutCompEmploymentsInputObjectSchema as OrganizationCreateOrConnectWithoutCompEmploymentsInputObjectSchema } from './OrganizationCreateOrConnectWithoutCompEmploymentsInput.schema';
import { OrganizationUpsertWithoutCompEmploymentsInputObjectSchema as OrganizationUpsertWithoutCompEmploymentsInputObjectSchema } from './OrganizationUpsertWithoutCompEmploymentsInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInputObjectSchema as OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInputObjectSchema } from './OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInput.schema';
import { OrganizationUpdateWithoutCompEmploymentsInputObjectSchema as OrganizationUpdateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUpdateWithoutCompEmploymentsInput.schema';
import { OrganizationUncheckedUpdateWithoutCompEmploymentsInputObjectSchema as OrganizationUncheckedUpdateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUncheckedUpdateWithoutCompEmploymentsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutCompEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutCompEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutCompEmploymentsInputObjectSchema).optional(),
  upsert: z.lazy(() => OrganizationUpsertWithoutCompEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInputObjectSchema), z.lazy(() => OrganizationUpdateWithoutCompEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutCompEmploymentsInputObjectSchema)]).optional()
}).strict();
export const OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInput>;
export const OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInputObjectZodSchema = makeSchema();
