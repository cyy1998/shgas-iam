import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleScalarWhereInputObjectSchema as OrganizationRoleScalarWhereInputObjectSchema } from './OrganizationRoleScalarWhereInput.schema';
import { OrganizationRoleUpdateManyMutationInputObjectSchema as OrganizationRoleUpdateManyMutationInputObjectSchema } from './OrganizationRoleUpdateManyMutationInput.schema';
import { OrganizationRoleUncheckedUpdateManyWithoutOrganizationInputObjectSchema as OrganizationRoleUncheckedUpdateManyWithoutOrganizationInputObjectSchema } from './OrganizationRoleUncheckedUpdateManyWithoutOrganizationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationRoleUpdateManyMutationInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedUpdateManyWithoutOrganizationInputObjectSchema)])
}).strict();
export const OrganizationRoleUpdateManyWithWhereWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateManyWithWhereWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateManyWithWhereWithoutOrganizationInput>;
export const OrganizationRoleUpdateManyWithWhereWithoutOrganizationInputObjectZodSchema = makeSchema();
