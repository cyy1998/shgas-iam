import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleCreateManyPositionInputObjectSchema as PositionRoleCreateManyPositionInputObjectSchema } from './PositionRoleCreateManyPositionInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => PositionRoleCreateManyPositionInputObjectSchema), z.lazy(() => PositionRoleCreateManyPositionInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const PositionRoleCreateManyPositionInputEnvelopeObjectSchema: z.ZodType<Prisma.PositionRoleCreateManyPositionInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateManyPositionInputEnvelope>;
export const PositionRoleCreateManyPositionInputEnvelopeObjectZodSchema = makeSchema();
