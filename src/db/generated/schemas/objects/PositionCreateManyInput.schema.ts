import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posCode: z.string().max(64),
  posName: z.string().max(128),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const PositionCreateManyInputObjectSchema: z.ZodType<Prisma.PositionCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateManyInput>;
export const PositionCreateManyInputObjectZodSchema = makeSchema();
