import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationUpdateWithoutDescendantClosuresInputObjectSchema as OrganizationUpdateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUpdateWithoutDescendantClosuresInput.schema';
import { OrganizationUncheckedUpdateWithoutDescendantClosuresInputObjectSchema as OrganizationUncheckedUpdateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUncheckedUpdateWithoutDescendantClosuresInput.schema';
import { OrganizationCreateWithoutDescendantClosuresInputObjectSchema as OrganizationCreateWithoutDescendantClosuresInputObjectSchema } from './OrganizationCreateWithoutDescendantClosuresInput.schema';
import { OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema as OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUncheckedCreateWithoutDescendantClosuresInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => OrganizationUpdateWithoutDescendantClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutDescendantClosuresInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationCreateWithoutDescendantClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema)]),
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationUpsertWithoutDescendantClosuresInputObjectSchema: z.ZodType<Prisma.OrganizationUpsertWithoutDescendantClosuresInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpsertWithoutDescendantClosuresInput>;
export const OrganizationUpsertWithoutDescendantClosuresInputObjectZodSchema = makeSchema();
