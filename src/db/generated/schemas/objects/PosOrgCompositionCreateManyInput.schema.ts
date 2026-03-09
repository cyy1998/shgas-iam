import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posId: z.number().int(),
  orgId: z.number().int(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const PosOrgCompositionCreateManyInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateManyInput>;
export const PosOrgCompositionCreateManyInputObjectZodSchema = makeSchema();
