import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeCreateManyPrivilegeInputObjectSchema as RolePrivilegeCreateManyPrivilegeInputObjectSchema } from './RolePrivilegeCreateManyPrivilegeInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => RolePrivilegeCreateManyPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeCreateManyPrivilegeInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const RolePrivilegeCreateManyPrivilegeInputEnvelopeObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateManyPrivilegeInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateManyPrivilegeInputEnvelope>;
export const RolePrivilegeCreateManyPrivilegeInputEnvelopeObjectZodSchema = makeSchema();
