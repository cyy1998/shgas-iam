import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeCreateManyRoleInputObjectSchema as RolePrivilegeCreateManyRoleInputObjectSchema } from './RolePrivilegeCreateManyRoleInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => RolePrivilegeCreateManyRoleInputObjectSchema), z.lazy(() => RolePrivilegeCreateManyRoleInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const RolePrivilegeCreateManyRoleInputEnvelopeObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateManyRoleInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateManyRoleInputEnvelope>;
export const RolePrivilegeCreateManyRoleInputEnvelopeObjectZodSchema = makeSchema();
