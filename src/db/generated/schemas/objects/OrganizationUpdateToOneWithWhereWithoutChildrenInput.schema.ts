import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { OrganizationUpdateWithoutChildrenInputObjectSchema as OrganizationUpdateWithoutChildrenInputObjectSchema } from './OrganizationUpdateWithoutChildrenInput.schema';
import { OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema as OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema } from './OrganizationUncheckedUpdateWithoutChildrenInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => OrganizationUpdateWithoutChildrenInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema)])
}).strict();
export const OrganizationUpdateToOneWithWhereWithoutChildrenInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutChildrenInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutChildrenInput>;
export const OrganizationUpdateToOneWithWhereWithoutChildrenInputObjectZodSchema = makeSchema();
