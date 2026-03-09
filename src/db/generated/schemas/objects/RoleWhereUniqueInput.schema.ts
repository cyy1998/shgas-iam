import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  roleCode: z.string().max(64).optional()
}).strict();
export const RoleWhereUniqueInputObjectSchema: z.ZodType<Prisma.RoleWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleWhereUniqueInput>;
export const RoleWhereUniqueInputObjectZodSchema = makeSchema();
