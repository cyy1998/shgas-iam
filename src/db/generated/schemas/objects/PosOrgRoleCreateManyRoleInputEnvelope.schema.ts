import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleCreateManyRoleInputObjectSchema as PosOrgRoleCreateManyRoleInputObjectSchema } from './PosOrgRoleCreateManyRoleInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => PosOrgRoleCreateManyRoleInputObjectSchema), z.lazy(() => PosOrgRoleCreateManyRoleInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const PosOrgRoleCreateManyRoleInputEnvelopeObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateManyRoleInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateManyRoleInputEnvelope>;
export const PosOrgRoleCreateManyRoleInputEnvelopeObjectZodSchema = makeSchema();
