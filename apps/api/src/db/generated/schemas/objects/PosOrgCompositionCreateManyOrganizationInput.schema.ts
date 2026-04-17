import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posId: z.number().int(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const PosOrgCompositionCreateManyOrganizationInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateManyOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateManyOrganizationInput>;
export const PosOrgCompositionCreateManyOrganizationInputObjectZodSchema = makeSchema();
