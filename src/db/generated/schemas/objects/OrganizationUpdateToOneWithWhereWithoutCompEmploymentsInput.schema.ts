import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { OrganizationUpdateWithoutCompEmploymentsInputObjectSchema as OrganizationUpdateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUpdateWithoutCompEmploymentsInput.schema';
import { OrganizationUncheckedUpdateWithoutCompEmploymentsInputObjectSchema as OrganizationUncheckedUpdateWithoutCompEmploymentsInputObjectSchema } from './OrganizationUncheckedUpdateWithoutCompEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => OrganizationUpdateWithoutCompEmploymentsInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutCompEmploymentsInputObjectSchema)])
}).strict();
export const OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInput>;
export const OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInputObjectZodSchema = makeSchema();
