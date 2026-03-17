import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { OrganizationUpdateWithoutAncestorClosuresInputObjectSchema as OrganizationUpdateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUpdateWithoutAncestorClosuresInput.schema';
import { OrganizationUncheckedUpdateWithoutAncestorClosuresInputObjectSchema as OrganizationUncheckedUpdateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUncheckedUpdateWithoutAncestorClosuresInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => OrganizationUpdateWithoutAncestorClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutAncestorClosuresInputObjectSchema)])
}).strict();
export const OrganizationUpdateToOneWithWhereWithoutAncestorClosuresInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutAncestorClosuresInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutAncestorClosuresInput>;
export const OrganizationUpdateToOneWithWhereWithoutAncestorClosuresInputObjectZodSchema = makeSchema();
