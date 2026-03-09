import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.number().int(),
  roleId: z.number().int(),
  isAllSub: z.boolean().optional()
}).strict();
export const OrganizationRoleCreateManyInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateManyInput>;
export const OrganizationRoleCreateManyInputObjectZodSchema = makeSchema();
