import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  roleCode: z.string().max(64),
  roleName: z.string().max(128),
  clientId: z.number().int(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const RoleCreateManyInputObjectSchema: z.ZodType<Prisma.RoleCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateManyInput>;
export const RoleCreateManyInputObjectZodSchema = makeSchema();
