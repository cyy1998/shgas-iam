import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateWithoutParentInputObjectSchema as OrganizationUpdateWithoutParentInputObjectSchema } from './OrganizationUpdateWithoutParentInput.schema';
import { OrganizationUncheckedUpdateWithoutParentInputObjectSchema as OrganizationUncheckedUpdateWithoutParentInputObjectSchema } from './OrganizationUncheckedUpdateWithoutParentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationUpdateWithoutParentInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutParentInputObjectSchema)])
}).strict();
export const OrganizationUpdateWithWhereUniqueWithoutParentInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateWithWhereUniqueWithoutParentInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateWithWhereUniqueWithoutParentInput>;
export const OrganizationUpdateWithWhereUniqueWithoutParentInputObjectZodSchema = makeSchema();
