import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationUpdateWithoutPosOrgCompositionInputObjectSchema as OrganizationUpdateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUpdateWithoutPosOrgCompositionInput.schema';
import { OrganizationUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema as OrganizationUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUncheckedUpdateWithoutPosOrgCompositionInput.schema';
import { OrganizationCreateWithoutPosOrgCompositionInputObjectSchema as OrganizationCreateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationCreateWithoutPosOrgCompositionInput.schema';
import { OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema as OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUncheckedCreateWithoutPosOrgCompositionInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => OrganizationUpdateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationCreateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema)]),
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationUpsertWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.OrganizationUpsertWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpsertWithoutPosOrgCompositionInput>;
export const OrganizationUpsertWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
