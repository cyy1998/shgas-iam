import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posId: z.number().int(),
  orgId: z.number().int()
}).strict();
export const PosOrgCompositionPosIdOrgIdCompoundUniqueInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionPosIdOrgIdCompoundUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionPosIdOrgIdCompoundUniqueInput>;
export const PosOrgCompositionPosIdOrgIdCompoundUniqueInputObjectZodSchema = makeSchema();
