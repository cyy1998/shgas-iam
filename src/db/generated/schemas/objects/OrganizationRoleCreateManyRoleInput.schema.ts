import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.number().int(),
  isAllSub: z.boolean().optional()
}).strict();
export const OrganizationRoleCreateManyRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateManyRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateManyRoleInput>;
export const OrganizationRoleCreateManyRoleInputObjectZodSchema = makeSchema();
