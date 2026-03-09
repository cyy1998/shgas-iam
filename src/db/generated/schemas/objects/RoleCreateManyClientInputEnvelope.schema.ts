import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleCreateManyClientInputObjectSchema as RoleCreateManyClientInputObjectSchema } from './RoleCreateManyClientInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => RoleCreateManyClientInputObjectSchema), z.lazy(() => RoleCreateManyClientInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const RoleCreateManyClientInputEnvelopeObjectSchema: z.ZodType<Prisma.RoleCreateManyClientInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateManyClientInputEnvelope>;
export const RoleCreateManyClientInputEnvelopeObjectZodSchema = makeSchema();
