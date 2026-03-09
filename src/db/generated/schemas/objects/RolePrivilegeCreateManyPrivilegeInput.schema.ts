import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int()
}).strict();
export const RolePrivilegeCreateManyPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateManyPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateManyPrivilegeInput>;
export const RolePrivilegeCreateManyPrivilegeInputObjectZodSchema = makeSchema();
