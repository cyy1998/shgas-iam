import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { OrganizationUpdateWithoutPosOrgCompositionInputObjectSchema as OrganizationUpdateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUpdateWithoutPosOrgCompositionInput.schema';
import { OrganizationUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema as OrganizationUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUncheckedUpdateWithoutPosOrgCompositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => OrganizationUpdateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema)])
}).strict();
export const OrganizationUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutPosOrgCompositionInput>;
export const OrganizationUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
