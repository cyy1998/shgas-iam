import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleCreateManyPosOrgInputObjectSchema as PosOrgRoleCreateManyPosOrgInputObjectSchema } from './PosOrgRoleCreateManyPosOrgInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => PosOrgRoleCreateManyPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleCreateManyPosOrgInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const PosOrgRoleCreateManyPosOrgInputEnvelopeObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateManyPosOrgInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateManyPosOrgInputEnvelope>;
export const PosOrgRoleCreateManyPosOrgInputEnvelopeObjectZodSchema = makeSchema();
