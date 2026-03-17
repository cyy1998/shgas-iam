import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { OrganizationUpdateWithoutDescendantClosuresInputObjectSchema as OrganizationUpdateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUpdateWithoutDescendantClosuresInput.schema';
import { OrganizationUncheckedUpdateWithoutDescendantClosuresInputObjectSchema as OrganizationUncheckedUpdateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUncheckedUpdateWithoutDescendantClosuresInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => OrganizationUpdateWithoutDescendantClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutDescendantClosuresInputObjectSchema)])
}).strict();
export const OrganizationUpdateToOneWithWhereWithoutDescendantClosuresInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutDescendantClosuresInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutDescendantClosuresInput>;
export const OrganizationUpdateToOneWithWhereWithoutDescendantClosuresInputObjectZodSchema = makeSchema();
