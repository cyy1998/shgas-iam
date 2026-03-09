import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionPosIdOrgIdCompoundUniqueInputObjectSchema as PosOrgCompositionPosIdOrgIdCompoundUniqueInputObjectSchema } from './PosOrgCompositionPosIdOrgIdCompoundUniqueInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posId_orgId: z.lazy(() => PosOrgCompositionPosIdOrgIdCompoundUniqueInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionWhereUniqueInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionWhereUniqueInput>;
export const PosOrgCompositionWhereUniqueInputObjectZodSchema = makeSchema();
