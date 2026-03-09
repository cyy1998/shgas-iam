import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleCreateManyRoleInputObjectSchema as PositionRoleCreateManyRoleInputObjectSchema } from './PositionRoleCreateManyRoleInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => PositionRoleCreateManyRoleInputObjectSchema), z.lazy(() => PositionRoleCreateManyRoleInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const PositionRoleCreateManyRoleInputEnvelopeObjectSchema: z.ZodType<Prisma.PositionRoleCreateManyRoleInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateManyRoleInputEnvelope>;
export const PositionRoleCreateManyRoleInputEnvelopeObjectZodSchema = makeSchema();
