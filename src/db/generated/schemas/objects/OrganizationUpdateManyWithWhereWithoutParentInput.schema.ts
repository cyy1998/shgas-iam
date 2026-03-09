import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationScalarWhereInputObjectSchema as OrganizationScalarWhereInputObjectSchema } from './OrganizationScalarWhereInput.schema';
import { OrganizationUpdateManyMutationInputObjectSchema as OrganizationUpdateManyMutationInputObjectSchema } from './OrganizationUpdateManyMutationInput.schema';
import { OrganizationUncheckedUpdateManyWithoutParentInputObjectSchema as OrganizationUncheckedUpdateManyWithoutParentInputObjectSchema } from './OrganizationUncheckedUpdateManyWithoutParentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationUpdateManyMutationInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateManyWithoutParentInputObjectSchema)])
}).strict();
export const OrganizationUpdateManyWithWhereWithoutParentInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateManyWithWhereWithoutParentInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateManyWithWhereWithoutParentInput>;
export const OrganizationUpdateManyWithWhereWithoutParentInputObjectZodSchema = makeSchema();
