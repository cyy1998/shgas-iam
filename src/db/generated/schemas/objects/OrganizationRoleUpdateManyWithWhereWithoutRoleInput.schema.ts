import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleScalarWhereInputObjectSchema as OrganizationRoleScalarWhereInputObjectSchema } from './OrganizationRoleScalarWhereInput.schema';
import { OrganizationRoleUpdateManyMutationInputObjectSchema as OrganizationRoleUpdateManyMutationInputObjectSchema } from './OrganizationRoleUpdateManyMutationInput.schema';
import { OrganizationRoleUncheckedUpdateManyWithoutRoleInputObjectSchema as OrganizationRoleUncheckedUpdateManyWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedUpdateManyWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationRoleUpdateManyMutationInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedUpdateManyWithoutRoleInputObjectSchema)])
}).strict();
export const OrganizationRoleUpdateManyWithWhereWithoutRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateManyWithWhereWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateManyWithWhereWithoutRoleInput>;
export const OrganizationRoleUpdateManyWithWhereWithoutRoleInputObjectZodSchema = makeSchema();
