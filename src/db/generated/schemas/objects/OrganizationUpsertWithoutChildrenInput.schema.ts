import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationUpdateWithoutChildrenInputObjectSchema as OrganizationUpdateWithoutChildrenInputObjectSchema } from './OrganizationUpdateWithoutChildrenInput.schema';
import { OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema as OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema } from './OrganizationUncheckedUpdateWithoutChildrenInput.schema';
import { OrganizationCreateWithoutChildrenInputObjectSchema as OrganizationCreateWithoutChildrenInputObjectSchema } from './OrganizationCreateWithoutChildrenInput.schema';
import { OrganizationUncheckedCreateWithoutChildrenInputObjectSchema as OrganizationUncheckedCreateWithoutChildrenInputObjectSchema } from './OrganizationUncheckedCreateWithoutChildrenInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => OrganizationUpdateWithoutChildrenInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationCreateWithoutChildrenInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutChildrenInputObjectSchema)]),
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationUpsertWithoutChildrenInputObjectSchema: z.ZodType<Prisma.OrganizationUpsertWithoutChildrenInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpsertWithoutChildrenInput>;
export const OrganizationUpsertWithoutChildrenInputObjectZodSchema = makeSchema();
