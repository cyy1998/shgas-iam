import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int(),
  privilegeId: z.number().int()
}).strict();
export const RolePrivilegeCreateManyInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateManyInput>;
export const RolePrivilegeCreateManyInputObjectZodSchema = makeSchema();
