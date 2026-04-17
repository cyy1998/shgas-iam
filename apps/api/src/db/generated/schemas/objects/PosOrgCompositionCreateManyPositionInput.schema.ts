import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  orgId: z.number().int(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const PosOrgCompositionCreateManyPositionInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateManyPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateManyPositionInput>;
export const PosOrgCompositionCreateManyPositionInputObjectZodSchema = makeSchema();
