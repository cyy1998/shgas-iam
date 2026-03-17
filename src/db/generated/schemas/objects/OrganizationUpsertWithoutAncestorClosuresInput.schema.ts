import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationUpdateWithoutAncestorClosuresInputObjectSchema as OrganizationUpdateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUpdateWithoutAncestorClosuresInput.schema';
import { OrganizationUncheckedUpdateWithoutAncestorClosuresInputObjectSchema as OrganizationUncheckedUpdateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUncheckedUpdateWithoutAncestorClosuresInput.schema';
import { OrganizationCreateWithoutAncestorClosuresInputObjectSchema as OrganizationCreateWithoutAncestorClosuresInputObjectSchema } from './OrganizationCreateWithoutAncestorClosuresInput.schema';
import { OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema as OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUncheckedCreateWithoutAncestorClosuresInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => OrganizationUpdateWithoutAncestorClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutAncestorClosuresInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationCreateWithoutAncestorClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema)]),
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationUpsertWithoutAncestorClosuresInputObjectSchema: z.ZodType<Prisma.OrganizationUpsertWithoutAncestorClosuresInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpsertWithoutAncestorClosuresInput>;
export const OrganizationUpsertWithoutAncestorClosuresInputObjectZodSchema = makeSchema();
