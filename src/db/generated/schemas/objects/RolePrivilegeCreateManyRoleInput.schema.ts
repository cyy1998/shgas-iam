import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  privilegeId: z.number().int()
}).strict();
export const RolePrivilegeCreateManyRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateManyRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateManyRoleInput>;
export const RolePrivilegeCreateManyRoleInputObjectZodSchema = makeSchema();
